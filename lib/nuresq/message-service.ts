import type { EmergencyIncident, SosDraft } from "./types";
import type { EmergencyMessage, MessageDeliveryEvent } from "./message-types";
import { calculateRisk, parseEmergencyDescription } from "./safety";
import {
  analyzeEmergencyMessage,
  sanitizeMessageText,
  structuredUpdateFromAnalysis,
} from "./message-analysis";

export function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function event(state: MessageDeliveryEvent["state"], at: string, detail: string): MessageDeliveryEvent {
  return { state, at, detail };
}

export function createUserMessage(options: {
  incident: EmergencyIncident;
  text: string;
  id?: string;
  now?: Date;
}): EmergencyMessage {
  const text = sanitizeMessageText(options.text);
  if (!text) throw new Error("Pesan tidak boleh kosong");
  const id = options.id ?? createMessageId();
  const createdAt = (options.now ?? new Date()).toISOString();
  const analysis = analyzeEmergencyMessage(text, options.incident.description);
  return {
    id,
    incidentId: options.incident.incident_id,
    senderType: "USER_MESSAGE",
    createdAt,
    text,
    structuredUpdate: structuredUpdateFromAnalysis(id, analysis),
    priority: analysis.priority,
    deliveryState: "DRAFT",
    transport: "NONE",
    acknowledgementId: null,
    responderReceiptId: null,
    responderReadAt: null,
    deliveryEvents: [event("DRAFT", createdAt, "Pesan dibuat")],
    attachmentRefs: [],
    simulation: false,
  };
}

export function createSystemMessage(options: {
  incidentId: string;
  text: string;
  now?: Date;
}): EmergencyMessage {
  const createdAt = (options.now ?? new Date()).toISOString();
  return {
    id: createMessageId(),
    incidentId: options.incidentId,
    senderType: "SYSTEM_MESSAGE",
    createdAt,
    text: sanitizeMessageText(options.text),
    structuredUpdate: null,
    priority: "NORMAL",
    deliveryState: "LOCAL_SAVED",
    transport: "LOCAL_QUEUE",
    acknowledgementId: null,
    responderReceiptId: null,
    responderReadAt: null,
    deliveryEvents: [event("LOCAL_SAVED", createdAt, "Peristiwa sistem disimpan")],
    attachmentRefs: [],
    simulation: false,
  };
}

export function createVerifiedResponderMessage(options: {
  incidentId: string;
  text: string;
  receiptId: string;
  receivedAt: string;
  source: "BACKEND" | "GATEWAY";
}): EmergencyMessage {
  if (!options.receiptId.trim() || !Number.isFinite(Date.parse(options.receivedAt))) {
    throw new Error("Receipt responder nyata diperlukan");
  }
  return {
    id: createMessageId(),
    incidentId: options.incidentId,
    senderType: "RESPONDER_MESSAGE",
    createdAt: options.receivedAt,
    text: sanitizeMessageText(options.text),
    structuredUpdate: null,
    priority: "IMPORTANT",
    deliveryState: "RESPONDER_RECEIVED",
    transport: options.source === "BACKEND" ? "DIRECT_INTERNET" : "NODE_RELAY",
    acknowledgementId: null,
    responderReceiptId: options.receiptId,
    responderReadAt: null,
    deliveryEvents: [{
      state: "RESPONDER_RECEIVED",
      at: options.receivedAt,
      detail: "Pesan terverifikasi berasal dari responder",
      acknowledgementId: options.receiptId,
    }],
    attachmentRefs: [],
    simulation: false,
  };
}

export function applyConfirmedIncidentUpdate(message: EmergencyMessage, incident: EmergencyIncident, now = new Date()) {
  const suggestion = message.structuredUpdate;
  if (!suggestion || suggestion.status === "CONFIRMED") {
    throw new Error("Tidak ada pembaruan baru yang perlu dikonfirmasi");
  }

  const combinedDescription = [incident.description.trim(), `Pembaruan kondisi: ${message.text}`]
    .filter(Boolean)
    .join("\n");
  const parsed = parseEmergencyDescription(combinedDescription);
  const updateVictimCount = suggestion.facts.find((item) => item.code === "VICTIM_COUNT");
  const victimCount = updateVictimCount ? parsed.victimCount : incident.victim_count;
  const mobilityLimited = incident.mobility === "terbatas"
    || suggestion.facts.some((item) => item.code === "MOBILITY" && item.value === "Terbatas");
  const draft: SosDraft = {
    type: incident.type,
    description: combinedDescription,
    victimCount,
    mobilityLimited,
    waterLevel: parsed.waterLevel,
    injuryAssessment: null,
  };
  const safety = calculateRisk(draft);
  const confirmedAt = now.toISOString();
  const updatedMessage: EmergencyMessage = {
    ...message,
    structuredUpdate: {
      ...suggestion,
      status: "CONFIRMED",
      confirmedAt,
      dismissedAt: null,
      safetyResult: {
        level: safety.level,
        reasons: safety.reasons,
        engineLabel: safety.engineLabel,
      },
    },
  };
  const updatedIncident: EmergencyIncident = {
    ...incident,
    description: combinedDescription,
    victim_count: victimCount,
    mobility: mobilityLimited ? "terbatas" : incident.mobility,
    risk_level: safety.level,
    // Updates own their ACK; original SOS acknowledgement is immutable.
    delivery_status: incident.delivery_status,
    delivery_capability: incident.delivery_capability,
    acknowledgement: incident.acknowledgement,
    last_delivery_attempt_at: incident.last_delivery_attempt_at,
  };
  return { message: updatedMessage, incident: updatedIncident, safety };
}
