export type MessageSenderType =
  | "USER_MESSAGE"
  | "RESPONDER_MESSAGE"
  | "SYSTEM_MESSAGE"
  | "AI_INSIGHT"
  | "DELIVERY_EVENT";

export type MessageDeliveryState =
  | "DRAFT"
  | "LOCAL_SAVED"
  | "QUEUED"
  | "SENDING"
  | "RELAYING"
  | "GATEWAY_RECEIVED"
  | "SERVER_ACKNOWLEDGED"
  | "RESPONDER_RECEIVED"
  | "RESPONDER_READ"
  | "FAILED";

export type MessageTransport =
  | "NONE"
  | "LOCAL_QUEUE"
  | "DIRECT_INTERNET"
  | "NODE_RELAY";

export type MessagePriority = "NORMAL" | "IMPORTANT" | "URGENT";

export type MessageAnalysisMode = "DETERMINISTIC_LOCAL" | "LOCAL_MODEL" | "CLOUD_AGENT";

export interface MessageConditionFact {
  code:
    | "WATER_TREND"
    | "WATER_LEVEL"
    | "BREATHING"
    | "MOBILITY"
    | "LOCATION_CONTEXT"
    | "VICTIM_COUNT"
    | "BATTERY"
    | "HELP_REQUEST";
  label: string;
  value: string;
  previousValue: string | null;
  importance: "info" | "important" | "urgent";
  evidence: string;
}

export interface MessageStructuredUpdate {
  sourceMessageId: string;
  signature: string;
  analysisMode: MessageAnalysisMode;
  facts: MessageConditionFact[];
  summary: string[];
  status: "SUGGESTED" | "CONFIRMED";
  confirmedAt: string | null;
  dismissedAt: string | null;
  safetyResult: {
    level: string;
    reasons: string[];
    engineLabel: string;
  } | null;
}

export interface MessageDeliveryEvent {
  state: MessageDeliveryState;
  at: string;
  detail: string;
  acknowledgementId?: string;
}

/**
 * Canonical, compact, relay-ready message record. Attachments are references,
 * never embedded base64 payloads, so the core record remains serializable.
 */
export interface EmergencyMessage {
  id: string;
  incidentId: string;
  senderType: MessageSenderType;
  createdAt: string;
  text: string;
  structuredUpdate: MessageStructuredUpdate | null;
  priority: MessagePriority;
  deliveryState: MessageDeliveryState;
  transport: MessageTransport;
  acknowledgementId: string | null;
  responderReceiptId: string | null;
  responderReadAt: string | null;
  deliveryEvents: MessageDeliveryEvent[];
  attachmentRefs: string[];
  simulation: boolean;
}

export interface ServerMessageAcknowledgement {
  acknowledgementId: string;
  acknowledgedAt: string;
}

export interface ResponderMessageReceipt {
  receiptId: string;
  receivedAt: string;
  readAt?: string | null;
}

export const MESSAGE_DELIVERY_COPY: Record<MessageDeliveryState, string> = {
  DRAFT: "Draf",
  LOCAL_SAVED: "Tersimpan di perangkat",
  QUEUED: "Menunggu jalur pengiriman",
  SENDING: "Sedang dikirim",
  RELAYING: "Sedang diteruskan",
  GATEWAY_RECEIVED: "Gateway menerima",
  SERVER_ACKNOWLEDGED: "Diterima sistem",
  RESPONDER_RECEIVED: "Diterima responder",
  RESPONDER_READ: "Dibaca responder",
  FAILED: "Belum dapat disimpan",
};

const PENDING_STATES = new Set<MessageDeliveryState>([
  "LOCAL_SAVED",
  "QUEUED",
  "SENDING",
  "RELAYING",
  "GATEWAY_RECEIVED",
  "FAILED",
]);

export function messageNeedsDelivery(message: EmergencyMessage) {
  return PENDING_STATES.has(message.deliveryState);
}

export function isValidServerAcknowledgement(value: unknown): value is ServerMessageAcknowledgement {
  if (!value || typeof value !== "object") return false;
  const acknowledgement = value as Partial<ServerMessageAcknowledgement>;
  return typeof acknowledgement.acknowledgementId === "string"
    && acknowledgement.acknowledgementId.trim().length > 0
    && typeof acknowledgement.acknowledgedAt === "string"
    && Number.isFinite(Date.parse(acknowledgement.acknowledgedAt));
}

export function isEmergencyMessage(value: unknown): value is EmergencyMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<EmergencyMessage>;
  return typeof message.id === "string"
    && message.id.length > 0
    && typeof message.incidentId === "string"
    && typeof message.createdAt === "string"
    && Number.isFinite(Date.parse(message.createdAt))
    && typeof message.text === "string"
    && typeof message.senderType === "string"
    && typeof message.deliveryState === "string"
    && Array.isArray(message.deliveryEvents)
    && Array.isArray(message.attachmentRefs);
}
