import type { ConnectivityState } from "./types";
import type {
  EmergencyMessage,
  MessageDeliveryEvent,
  MessageDeliveryState,
  MessageTransport,
  ResponderMessageReceipt,
  ServerMessageAcknowledgement,
} from "./message-types";
import { isValidServerAcknowledgement, messageNeedsDelivery } from "./message-types";
import { hybridMode } from './backend/runtime';
import { localAI } from './ai/LocalAIManager';

export interface EmergencyMessageStore {
  saveMessage(message: EmergencyMessage): Promise<EmergencyMessage>;
  getMessage(messageId: string): Promise<EmergencyMessage | null>;
  getPendingMessages(incidentId?: string): Promise<EmergencyMessage[]>;
}

export interface MessageBackendAdapter {
  send(message: EmergencyMessage): Promise<ServerMessageAcknowledgement | null>;
}

export interface RelayDeliveryResult {
  gatewayAcknowledgementId: string;
  receivedAt: string;
  serverAcknowledgement?: ServerMessageAcknowledgement | null;
}

export interface MessageRelayAdapter {
  send(message: EmergencyMessage): Promise<RelayDeliveryResult | null>;
}

export interface MessagingCapabilities {
  backend: MessageBackendAdapter | null;
  relay: MessageRelayAdapter | null;
  localModelAvailable: boolean;
  cloudCoordinatorAvailable: boolean;
}

export interface RuntimeMessagingConfiguration {
  backendEndpoint?: string;
  relayAdapter?: MessageRelayAdapter;
  localModelAvailable?: boolean;
  cloudCoordinatorAvailable?: boolean;
}

declare global {
  interface Window {
    __NURESQ_MESSAGING__?: RuntimeMessagingConfiguration;
  }
}

type MessageChangeListener = (message: EmergencyMessage) => void;

function deliveryEvent(
  state: MessageDeliveryState,
  at: string,
  detail: string,
  acknowledgementId?: string,
): MessageDeliveryEvent {
  return { state, at, detail, acknowledgementId };
}

function transitioned(
  message: EmergencyMessage,
  state: MessageDeliveryState,
  detail: string,
  transport: MessageTransport,
  options: { now?: Date; acknowledgementId?: string } = {},
) {
  const at = (options.now ?? new Date()).toISOString();
  return {
    ...message,
    deliveryState: state,
    transport,
    acknowledgementId: options.acknowledgementId ?? message.acknowledgementId,
    deliveryEvents: [
      ...message.deliveryEvents,
      deliveryEvent(state, at, detail, options.acknowledgementId),
    ],
  } satisfies EmergencyMessage;
}

function validGatewayResult(value: RelayDeliveryResult | null): value is RelayDeliveryResult {
  return Boolean(value)
    && typeof value!.gatewayAcknowledgementId === "string"
    && value!.gatewayAcknowledgementId.trim().length > 0
    && Number.isFinite(Date.parse(value!.receivedAt));
}

export class HttpMessageBackendAdapter implements MessageBackendAdapter {
  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {}

  async send(message: EmergencyMessage) {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": message.id },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`Layanan pesan merespons ${response.status}`);
    const payload = await response.json() as unknown;
    return isValidServerAcknowledgement(payload) ? payload : null;
  }
}

export function getRuntimeMessagingCapabilities(): MessagingCapabilities {
  if (typeof window === "undefined") {
    return { backend: null, relay: null, localModelAvailable: false, cloudCoordinatorAvailable: false };
  }
  const runtime = window.__NURESQ_MESSAGING__;
  const endpoint = runtime?.backendEndpoint?.trim();
  return {
    backend: endpoint ? new HttpMessageBackendAdapter(endpoint) : null,
    relay: runtime?.relayAdapter ?? null,
    localModelAvailable: localAI.getState() === 'READY',
    cloudCoordinatorAvailable: runtime?.cloudCoordinatorAvailable === true,
  };
}

export class MessageTransportManager {
  constructor(
    private readonly store: EmergencyMessageStore,
    private readonly capabilities: MessagingCapabilities,
  ) {}

  get capabilityState() {
    return {
      backendAvailable: Boolean(this.capabilities.backend),
      relayAvailable: Boolean(this.capabilities.relay),
      localModelAvailable: this.capabilities.localModelAvailable,
      cloudCoordinatorAvailable: this.capabilities.cloudCoordinatorAvailable,
    };
  }

  private async persist(message: EmergencyMessage, onChange?: MessageChangeListener) {
    const saved = await this.store.saveMessage(message);
    onChange?.(saved);
    return saved;
  }

  private async queue(message: EmergencyMessage, detail: string, onChange?: MessageChangeListener) {
    if (message.deliveryState === "QUEUED" && message.transport === "LOCAL_QUEUE") return message;
    return this.persist(transitioned(message, "QUEUED", detail, "LOCAL_QUEUE"), onChange);
  }

  async send(draft: EmergencyMessage, connectivity: ConnectivityState, onChange?: MessageChangeListener) {
    const existing = await this.store.getMessage(draft.id);
    if (existing && !messageNeedsDelivery(existing)) return existing;

    let message = existing ?? draft;
    if (message.deliveryState === "DRAFT") {
      message = await this.persist(
        transitioned(message, "LOCAL_SAVED", "Tersimpan di perangkat", "LOCAL_QUEUE"),
        onChange,
      );
    }

    if (connectivity === "CONNECTED" && this.capabilities.backend) {
      return this.sendDirect(message, onChange);
    }
    if (this.capabilities.relay) {
      return this.sendRelay(message, onChange);
    }
    return this.queue(
      message,
      connectivity === "OFFLINE" ? "Menunggu jalur pengiriman" : "Layanan pengiriman belum dikonfigurasi",
      onChange,
    );
  }

  private async sendDirect(message: EmergencyMessage, onChange?: MessageChangeListener) {
    const sending = await this.persist(
      transitioned(message, "SENDING", "Mengirim ke layanan nuRESQ", "DIRECT_INTERNET"),
      onChange,
    );
    try {
      const acknowledgement = await this.capabilities.backend!.send(sending);
      if (!isValidServerAcknowledgement(acknowledgement)) {
        return this.queue(sending, "ACK sistem belum diterima; pesan tetap dalam antrean", onChange);
      }
      return this.persist(transitioned(
        sending,
        "SERVER_ACKNOWLEDGED",
        "Diterima sistem",
        "DIRECT_INTERNET",
        { now: new Date(acknowledgement.acknowledgedAt), acknowledgementId: acknowledgement.acknowledgementId },
      ), onChange);
    } catch {
      return this.queue(sending, "Pengiriman gagal; menunggu pengiriman ulang", onChange);
    }
  }

  private async sendRelay(message: EmergencyMessage, onChange?: MessageChangeListener) {
    const relaying = await this.persist(
      transitioned(message, "RELAYING", "Sedang diteruskan melalui jalur relay", "NODE_RELAY"),
      onChange,
    );
    try {
      const result = await this.capabilities.relay!.send(relaying);
      if (!validGatewayResult(result)) {
        return this.queue(relaying, "Relay belum memberikan ACK gateway", onChange);
      }
      const gatewayReceived = await this.persist(transitioned(
        relaying,
        "GATEWAY_RECEIVED",
        "Gateway menerima",
        "NODE_RELAY",
        { now: new Date(result.receivedAt), acknowledgementId: result.gatewayAcknowledgementId },
      ), onChange);
      if (!isValidServerAcknowledgement(result.serverAcknowledgement)) return gatewayReceived;
      return this.persist(transitioned(
        gatewayReceived,
        "SERVER_ACKNOWLEDGED",
        "Diterima sistem",
        "NODE_RELAY",
        {
          now: new Date(result.serverAcknowledgement.acknowledgedAt),
          acknowledgementId: result.serverAcknowledgement.acknowledgementId,
        },
      ), onChange);
    } catch {
      return this.queue(relaying, "Relay gagal; pesan tetap menunggu", onChange);
    }
  }

  async retryPending(connectivity: ConnectivityState, incidentId?: string, onChange?: MessageChangeListener) {
    if (!this.capabilities.backend && !this.capabilities.relay) return this.store.getPendingMessages(incidentId);
    const pending = await this.store.getPendingMessages(incidentId);
    const results: EmergencyMessage[] = [];
    for (const message of pending) results.push(await this.send(message, connectivity, onChange));
    return results;
  }

  async applyServerAcknowledgement(messageId: string, acknowledgement: ServerMessageAcknowledgement, onChange?: MessageChangeListener) {
    if (!isValidServerAcknowledgement(acknowledgement)) throw new Error("ACK sistem nyata diperlukan");
    const message = await this.store.getMessage(messageId);
    if (!message) throw new Error("Pesan tidak ditemukan");
    return this.persist(transitioned(
      message,
      "SERVER_ACKNOWLEDGED",
      "Diterima sistem",
      message.transport === "NODE_RELAY" ? "NODE_RELAY" : "DIRECT_INTERNET",
      { now: new Date(acknowledgement.acknowledgedAt), acknowledgementId: acknowledgement.acknowledgementId },
    ), onChange);
  }

  async applyResponderReceipt(messageId: string, receipt: ResponderMessageReceipt, onChange?: MessageChangeListener) {
    if (!receipt.receiptId.trim() || !Number.isFinite(Date.parse(receipt.receivedAt))) {
      throw new Error("Receipt responder nyata diperlukan");
    }
    const message = await this.store.getMessage(messageId);
    if (!message) throw new Error("Pesan tidak ditemukan");
    const state: MessageDeliveryState = receipt.readAt && Number.isFinite(Date.parse(receipt.readAt))
      ? "RESPONDER_READ"
      : "RESPONDER_RECEIVED";
    const at = state === "RESPONDER_READ" ? receipt.readAt! : receipt.receivedAt;
    const updated = transitioned(
      message,
      state,
      state === "RESPONDER_READ" ? "Dibaca responder" : "Diterima responder",
      message.transport,
      { now: new Date(at), acknowledgementId: receipt.receiptId },
    );
    return this.persist({
      ...updated,
      responderReceiptId: receipt.receiptId,
      responderReadAt: state === "RESPONDER_READ" ? at : null,
    }, onChange);
  }
}
