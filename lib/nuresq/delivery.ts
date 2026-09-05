import type { DeliveryStatus, EmergencyIncident } from "./types";

export type DeliveryEvent =
  | "SAVE_LOCAL"
  | "QUEUE"
  | "START_SEND"
  | "TRANSPORT_SENT"
  | "ACK_RECEIVED"
  | "FAIL"
  | "RETRY";

const transitions: Record<DeliveryStatus, Partial<Record<DeliveryEvent, DeliveryStatus>>> = {
  DRAFT: { SAVE_LOCAL: "LOCAL_SAVED" },
  LOCAL_SAVED: { QUEUE: "PENDING" },
  PENDING: { START_SEND: "SENDING", RETRY: "RETRYING" },
  SENDING: { TRANSPORT_SENT: "SENT", FAIL: "FAILED" },
  SENT: { ACK_RECEIVED: "ACKNOWLEDGED", FAIL: "FAILED", RETRY: "RETRYING" },
  ACKNOWLEDGED: {},
  FAILED: { RETRY: "RETRYING" },
  RETRYING: { START_SEND: "SENDING", FAIL: "FAILED" },
};

export function transitionDeliveryStatus(current: DeliveryStatus, event: DeliveryEvent) {
  return transitions[current][event] ?? current;
}

export function hasVerifiedAcknowledgement(incident: EmergencyIncident) {
  return incident.delivery_status === "ACKNOWLEDGED"
    && Boolean(incident.acknowledgement?.id.trim())
    && Boolean(incident.acknowledgement?.acknowledgedAt);
}

export function remainsPendingUntilAcknowledged(incident: EmergencyIncident) {
  return !hasVerifiedAcknowledgement(incident);
}
