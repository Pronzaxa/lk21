import { hasVerifiedAcknowledgement } from "./delivery";
import type { EmergencyIncident, NetworkMode } from "./types";

export type IncidentLifecycleState = "ACTIVE" | "RESOLVED" | "CANCELLED";

export interface IncidentStatusPresentation {
  lifecycle: IncidentLifecycleState;
  title: "SOS AKTIF" | "SOS SELESAI" | "SOS DIBATALKAN";
  detail: string;
  deliveryDetail: string | null;
  acknowledged: boolean;
}

const TERMINAL_LIFECYCLE = new Map<string, IncidentLifecycleState>([
  ["RESOLVED", "RESOLVED"],
  ["SELESAI", "RESOLVED"],
  ["CLOSED", "RESOLVED"],
  ["COMPLETED", "RESOLVED"],
  ["ARCHIVED", "RESOLVED"],
  ["CANCELLED", "CANCELLED"],
  ["CANCELED", "CANCELLED"],
  ["DIBATALKAN", "CANCELLED"],
]);

/**
 * The current persisted incident schema does not yet own a lifecycle field.
 * This resolver intentionally reads only explicit lifecycle-like fields when
 * they exist, and otherwise treats an incident selected by the repository's
 * active-incident pointer as ACTIVE. It never infers ACTIVE from history order.
 */
export function resolveIncidentLifecycle(incident: EmergencyIncident): IncidentLifecycleState {
  const record = incident as EmergencyIncident & Record<string, unknown>;
  const candidates = [record.incident_lifecycle, record.lifecycle, record.incident_status];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const resolved = TERMINAL_LIFECYCLE.get(candidate.trim().toUpperCase());
    if (resolved) return resolved;
  }
  return "ACTIVE";
}

export function priorityLabel(riskLevel: string) {
  return riskLevel.replace(/^PRIORITAS\s+/i, "").trim() || "BELUM DINILAI";
}

export function priorityTone(riskLevel: string) {
  const value = riskLevel.toLowerCase();
  if (value.includes("kritis")) return "critical";
  if (value.includes("tinggi")) return "high";
  if (value.includes("sedang")) return "medium";
  return "neutral";
}

export function reportStateForIncident(incident: EmergencyIncident | null): "idle" | "queued" | "ready" {
  if (!incident || resolveIncidentLifecycle(incident) !== "ACTIVE") return "idle";
  if (incident.connectivity_state === "OFFLINE" && ["LOCAL_SAVED", "PENDING", "FAILED", "RETRYING"].includes(incident.delivery_status)) return "queued";
  return "ready";
}

export function incidentStatusPresentation(
  incident: EmergencyIncident,
  networkMode: NetworkMode,
  responderEvidence: "none" | "received" | "read" = "none",
): IncidentStatusPresentation {
  const lifecycle = resolveIncidentLifecycle(incident);
  if (lifecycle === "RESOLVED") {
    return { lifecycle, title: "SOS SELESAI", detail: "Insiden telah ditandai selesai.", deliveryDetail: null, acknowledged: hasVerifiedAcknowledgement(incident) };
  }
  if (lifecycle === "CANCELLED") {
    return { lifecycle, title: "SOS DIBATALKAN", detail: "Insiden telah dibatalkan.", deliveryDetail: null, acknowledged: hasVerifiedAcknowledgement(incident) };
  }

  if (responderEvidence === "read") {
    return { lifecycle, title: "SOS AKTIF", detail: "Responder telah melihat laporan.", deliveryDetail: null, acknowledged: true };
  }
  if (responderEvidence === "received") {
    return { lifecycle, title: "SOS AKTIF", detail: "Responder telah menerima laporan.", deliveryDetail: null, acknowledged: true };
  }
  if (hasVerifiedAcknowledgement(incident)) {
    return { lifecycle, title: "SOS AKTIF", detail: "Sistem telah menerima laporan.", deliveryDetail: null, acknowledged: true };
  }

  if (networkMode === "offline") {
    return {
      lifecycle,
      title: "SOS AKTIF",
      detail: "Menunggu jalur pengiriman.",
      deliveryDetail: "Tersimpan di perangkat.",
      acknowledged: false,
    };
  }

  if (incident.delivery_status === "SENDING" || incident.delivery_status === "SENT") {
    return {
      lifecycle,
      title: "SOS AKTIF",
      detail: "Sedang menunggu konfirmasi sistem.",
      deliveryDetail: incident.delivery_status === "SENT" ? "Belum ada konfirmasi penerimaan." : null,
      acknowledged: false,
    };
  }

  if (incident.delivery_status === "FAILED") {
    return {
      lifecycle,
      title: "SOS AKTIF",
      detail: "Belum ada jalur pengiriman yang terkonfirmasi.",
      deliveryDetail: "Laporan tetap tersimpan di perangkat.",
      acknowledged: false,
    };
  }

  return {
    lifecycle,
    title: "SOS AKTIF",
    detail: "Belum ada konfirmasi dari sistem.",
    deliveryDetail: ["LOCAL_SAVED", "PENDING", "RETRYING"].includes(incident.delivery_status) ? "Tersimpan di perangkat." : null,
    acknowledged: false,
  };
}
