import { CloudOff, MessageSquareText, RadioTower, Wifi, WifiOff } from "lucide-react";
import type { ConnectivityState, EmergencyIncident } from "@/lib/nuresq/types";

function priorityTone(priority: string) {
  const normalized = priority.toUpperCase();
  if (normalized.includes("KRITIS")) return "critical";
  if (normalized.includes("TINGGI")) return "high";
  return "medium";
}

export function IncidentMessageHeader({
  incident,
  connectivity,
  backendAvailable,
  relayAvailable,
}: {
  incident: EmergencyIncident;
  connectivity: ConnectivityState;
  backendAvailable: boolean;
  relayAvailable: boolean;
}) {
  const connection = (() => {
    if (relayAvailable && connectivity !== "CONNECTED") return { label: "Jalur relay tersedia", tone: "relay", Icon: RadioTower };
    if (connectivity === "OFFLINE") return { label: "Mode offline", tone: "offline", Icon: WifiOff };
    if (connectivity === "DEGRADED" || connectivity === "BACKEND_UNREACHABLE") return { label: "Jaringan terbatas", tone: "degraded", Icon: CloudOff };
    if (backendAvailable) return { label: "Terhubung", tone: "connected", Icon: Wifi };
    return { label: "Menunggu jalur pengiriman", tone: "waiting", Icon: CloudOff };
  })();
  const ConnectionIcon = connection.Icon;
  const shortId = incident.incident_id.length > 14 ? incident.incident_id.slice(-8).toUpperCase() : incident.incident_id;

  return (
    <header className="message-incident-header">
      <div className="message-incident-symbol"><MessageSquareText aria-hidden="true" /></div>
      <div className="message-incident-copy">
        <span>PESAN INSIDEN</span>
        <div><strong>{shortId}</strong><i aria-hidden="true" /> <b>{incident.type ?? "Darurat"}</b></div>
      </div>
      <div className="message-header-statuses">
        <span className={`message-priority ${priorityTone(incident.risk_level)}`}>{incident.risk_level}</span>
        <span className={`message-connection ${connection.tone}`}><ConnectionIcon aria-hidden="true" />{connection.label}</span>
      </div>
    </header>
  );
}
