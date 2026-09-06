"use client";

import {
  BellRing,
  BookOpenCheck,
  ChevronRight,
  MapPin,
  MessageSquareText,
  RadioTower,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ConnectivityReport } from "@/lib/nuresq/connectivity";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import { fieldGuides } from "@/lib/nuresq/field-guides";
import { emergencyResponse } from "@/lib/nuresq/assistant-emergency";
import { localAI } from '@/lib/nuresq/ai/LocalAIManager';
import { analyzeLocally, enrichAssistant } from '@/lib/nuresq/ai/EmergencyPipeline';
import { getConfig } from '@/config/nuresq.config';

function LocalAIStatus(){const state=useSyncExternalStore(localAI.subscribe,localAI.getState,()=> 'UNAVAILABLE');return <small role="status">{state==='READY'?'Analisis lokal tersedia':state==='FAILED'?'Analisis lokal terbatas':'Analisis dasar tersedia'}</small>;}
async function hybridAnswer(text:string,feed:LiveHazardFeed|null,incident?:EmergencyIncident){
  const local=await analyzeLocally(text,incident?.type??null);
  if(incident&&/ringkas|kondisi saya|kondisi saat ini|prioritas|kenapa.*(?:sedang|tinggi|kritis)/i.test(text)) return {response:activeLocalAnswer(text,incident,feed),local};
  const mapping:Record<string,string>={FLOOD:'banjir',EARTHQUAKE:'gempa',FIRE:'kebakaran',LANDSLIDE:'longsor',MEDICAL:'medis',TRAPPED:'waiting',EVACUATION_REQUEST:'prepare-sos'};
  const semantic=local.ai.guides.find(g=>g.confidence>=getConfig().localAI.guideThreshold);
  const id=mapping[local.incidentType.value]??(local.negatedTypes.length?null:semantic?.id);
  const guide=fieldGuides.find(g=>g.id===id);
  const response=guide?{text:`${guide.title}: ${guide.steps.join(' ')}`,source:local.incidentType.source==='LOCAL_AI'?'Panduan dari pencarian lokal':'Panduan offline'}:incident?activeLocalAnswer(text,incident,feed):localAnswer(text,feed);
  const online=await enrichAssistant(text,local,incident?.incident_id).catch(()=>null);
  const generalIntent=local.incidentType.value==='OTHER'||local.incidentType.value==='GENERAL_GUIDANCE';
  const safeToUseOnline=Boolean(online?.online_text)&&generalIntent&&!emergencyResponse(text)&&!guide;
  if(safeToUseOnline)return {response:{text:online.online_text,source:`Gemini online · ${online.model??'AI Hosting'}`},local};
  return {response,local};
}
import {
  incidentStatusPresentation,
  priorityLabel,
  priorityTone,
} from "@/lib/nuresq/incident-state";
import { detectSafetySignals, parseEmergencyDescription } from "@/lib/nuresq/safety";
import type { EmergencyIncident, LiveHazardFeed, LocationSnapshot, NetworkMode } from "@/lib/nuresq/types";
import { MessagesPage, type MessageDraftSeed } from "../messages/MessagesPage";

export interface AssistantLaunchRequest {
  key: number;
  mode: "assistant" | "responder";
  draft?: string;
}

interface AssistantEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  source: string | null;
}

type ResponderEvidence = "none" | "received" | "read";

interface ConditionFact {
  id: string;
  text: string;
  tone?: "warning" | "critical";
}

function guideForQuestion(text: string) {
  const normalized = text.toLowerCase();
  if (/offline|internet|koneksi|sinyal/.test(normalized)) return fieldGuides.find((guide) => guide.id === "offline") ?? null;
  if (/lokasi|gps|alamat|patokan/.test(normalized)) return fieldGuides.find((guide) => guide.id === "location") ?? null;
  if (/menunggu|bantuan|petugas|responder/.test(normalized)) return fieldGuides.find((guide) => guide.id === "waiting") ?? null;
  if (/sos|laporan/.test(normalized)) return fieldGuides.find((guide) => guide.id === "prepare-sos") ?? null;
  return null;
}

function localAnswer(text: string, hazardFeed: LiveHazardFeed | null) {
  const normalized = text.trim().toLowerCase().replace(/[!?.,]+$/g, "");
  if (/^(hi|hai|halo|hello|hei|tes|test|pagi|siang|sore|malam)( asisten| nuresq)?$/.test(normalized)) {
    return {
      text: "Halo, saya Asisten nuRESQ. Ceritakan kondisi Anda atau pilih Panduan Darurat, Cek Kondisi Sekitar, dan Peta untuk bantuan yang tersedia.",
      source: "Asisten lokal",
    };
  }
  const emergency = emergencyResponse(text);
  if (emergency) return emergency;
  const guide = guideForQuestion(text);
  if (guide) {
    return {
      text: `${guide.title}: ${guide.steps.join(" ")}`,
      source: "Panduan Offline",
    };
  }

  const normalizedText = text.toLowerCase();
  if (/kondisi sekitar|bahaya sekitar|hazard|sekitar saya/.test(normalizedText)) {
    const alerts = hazardFeed?.alerts ?? [];
    if (alerts.length) {
      return {
        text: alerts.slice(0, 3).map((alert) => `${alert.title}: ${alert.detail}`).join("\n"),
        source: "Data Hazard",
      };
    }
    return {
      text: "Data bahaya terbaru di sekitar Anda belum tersedia. Saya tidak akan menebak kondisi lapangan.",
      source: "Status Data",
    };
  }

  if (/tempat aman|evakuasi|shelter|posko|rumah sakit/.test(normalizedText)) {
    return {
      text: "Gunakan Peta untuk melihat titik referensi yang tersedia. Status operasional, kapasitas, dan akses aman tetap perlu diverifikasi.",
      source: "Referensi Peta",
    };
  }

  if (/gempa|banjir|kebakaran|longsor/.test(normalizedText)) {
    return {
      text: "Panduan lokal spesifik untuk pertanyaan ini belum tersedia di paket saat ini. Gunakan Panduan Darurat, cek kondisi sekitar, atau buka Peta. Jika kondisi langsung mengancam keselamatan, gunakan SOS.",
      source: "Batas Kemampuan Lokal",
    };
  }

  return {
    text: "Panduan lokal untuk pertanyaan itu belum tersedia. Saya tidak akan mengarang jawaban. Gunakan Panduan Darurat, Cek Kondisi Sekitar, atau Peta untuk informasi yang memang tersedia.",
    source: "Batas Kemampuan Lokal",
  };
}

function responderEvidenceFromMessages(messages: Awaited<ReturnType<typeof EmergencyRepository.getMessages>>): ResponderEvidence {
  if (messages.some((message) => message.responderReadAt || message.deliveryState === "RESPONDER_READ")) return "read";
  if (messages.some((message) => message.responderReceiptId || message.deliveryState === "RESPONDER_RECEIVED" || message.senderType === "RESPONDER_MESSAGE")) return "received";
  return "none";
}

function waterFact(description: string) {
  const parsed = parseEmergencyDescription(description);
  if (parsed.waterLevel <= 0) return null;
  if (/pinggang/i.test(description)) return "Air setinggi pinggang";
  return `Air sekitar ${parsed.waterLevel} cm`;
}

function conditionFacts(incident: EmergencyIncident): ConditionFact[] {
  const facts: ConditionFact[] = [];
  const parsed = parseEmergencyDescription(incident.description);
  const victimCount = incident.victim_count ?? parsed.victimCount;
  if (victimCount !== null && victimCount > 0) facts.push({ id: "victims", text: `${victimCount} korban` });
  const water = waterFact(incident.description);
  if (water) facts.push({ id: "water", text: water, tone: parsed.waterLevel >= 70 ? "warning" : undefined });
  if (incident.mobility === "terbatas" || parsed.mobilityLimited) facts.push({ id: "mobility", text: "Mobilitas terbatas", tone: "warning" });

  const redFlags = incident.injury_triage?.red_flags;
  if (redFlags?.breathingDifficulty) facts.push({ id: "breathing", text: "Kesulitan bernapas", tone: "critical" });
  if (redFlags?.unconscious) facts.push({ id: "unconscious", text: "Tidak sadar", tone: "critical" });
  if (redFlags?.uncontrolledBleeding) facts.push({ id: "bleeding", text: "Perdarahan", tone: "critical" });
  if (redFlags?.suspectedFracture) facts.push({ id: "fracture", text: "Dugaan patah tulang", tone: "warning" });
  return facts;
}

function conciseIncidentSummary(incident: EmergencyIncident) {
  const parsed = parseEmergencyDescription(incident.description);
  const victimCount = incident.victim_count ?? parsed.victimCount;
  const sentences: string[] = [];
  if (victimCount !== null && victimCount > 0) {
    sentences.push(`${victimCount} korban terdampak${incident.type ? ` ${incident.type.toLowerCase()}` : ""}.`);
  } else if (incident.type) {
    sentences.push(`Insiden ${incident.type.toLowerCase()} masih aktif.`);
  }
  const water = waterFact(incident.description);
  if (water) sentences.push(`${water}.`);
  if (incident.mobility === "terbatas" || parsed.mobilityLimited) sentences.push("Ada korban dengan keterbatasan mobilitas.");
  const redFlags = incident.injury_triage?.red_flags;
  if (redFlags?.breathingDifficulty) sentences.push("Kesulitan bernapas tercatat pada asesmen awal.");
  else if (redFlags?.unconscious) sentences.push("Kondisi tidak sadar tercatat pada asesmen awal.");
  else if (redFlags?.uncontrolledBleeding) sentences.push("Perdarahan tercatat pada asesmen awal.");
  if (!sentences.length && incident.description.trim()) return `Kondisi awal: ${incident.description.trim()}`;
  return sentences.join(" ");
}

function activeLocalAnswer(text: string, incident: EmergencyIncident, hazardFeed: LiveHazardFeed | null) {
  const normalized = text.toLowerCase();
  if (/ringkas|kondisi saya|kondisi saat ini/.test(normalized)) {
    return { text: conciseIncidentSummary(incident), source: "Laporan SOS Anda" };
  }
  if (/prioritas|kenapa.*sedang|kenapa.*tinggi|kenapa.*kritis/.test(normalized)) {
    return {
      text: `Prioritas ${priorityLabel(incident.risk_level)} berasal dari penilaian keselamatan saat SOS dibuat. Asisten tidak menghitung ulang prioritas dari percakapan ini.`,
      source: "Laporan SOS",
    };
  }
  return localAnswer(text, hazardFeed);
}

export function AssistantHubPage({
  reportState,
  networkMode,
  connectivity,
  location,
  hazardFeed,
  onCreateSos,
  onOpenMap,
  launchRequest,
}: {
  reportState: "idle" | "queued" | "ready";
  networkMode: NetworkMode;
  connectivity: ConnectivityReport;
  location: LocationSnapshot | null;
  hazardFeed: LiveHazardFeed | null;
  onCreateSos: () => void;
  onOpenMap: () => void;
  launchRequest?: AssistantLaunchRequest | null;
}) {
  const [incident, setIncident] = useState<EmergencyIncident | null>(null);
  const [responderEvidence, setResponderEvidence] = useState<ResponderEvidence>("none");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"assistant" | "responder">("assistant");
  const [draftSeed, setDraftSeed] = useState<MessageDraftSeed | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const reload=()=>{ void EmergencyRepository.getActiveIncident()
      .then(async (activeIncident) => {
        if (cancelled) return;
        setIncident(activeIncident);
        if (!activeIncident) {
          setResponderEvidence("none");
          return;
        }
        try {
          const messages = await EmergencyRepository.getMessages(activeIncident.incident_id);
          if (!cancelled) setResponderEvidence(responderEvidenceFromMessages(messages));
        } catch {
          if (!cancelled) setResponderEvidence("none");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIncident(null);
          setResponderEvidence("none");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); }); };
    reload();window.addEventListener('nuresq-repository-change',reload);
    return () => { cancelled = true;window.removeEventListener('nuresq-repository-change',reload); };
  }, [reportState]);

  useEffect(() => {
    if (!launchRequest) return;
    setMode(launchRequest.mode);
    if (launchRequest.draft) setDraftSeed({ key: launchRequest.key, text: launchRequest.draft });
  }, [launchRequest]);

  if (loading) return <div className="assistant-hub assistant-loading" aria-label="Memuat Asisten"><i /><i /><i /></div>;

  if (!incident) {
    return <AssistantHome networkMode={networkMode} location={location} hazardFeed={hazardFeed} onCreateSos={onCreateSos} onOpenMap={onOpenMap} />;
  }

  const status = incidentStatusPresentation(incident, networkMode, responderEvidence);
  const connectionLabel = networkMode === "offline"
    ? "Mode lokal"
    : connectivity.state === "CONNECTED"
      ? "Terhubung"
      : "Jaringan terbatas";

  return (
    <div className="assistant-hub active-incident-assistant assistant-v2-active">
      <header className="assistant-v2-context">
        <LocalAIStatus />
        <div className="assistant-v2-identity"><Sparkles aria-hidden="true" /><span>ASISTEN</span></div>
        <div className="assistant-v2-status-row">
          <div className="assistant-v2-incident-title">
            <span className="assistant-v2-sos-label"><Siren aria-hidden="true" /> {status.title}</span>
            <h2>{incident.type ?? "Insiden darurat"}</h2>
            <small>{incident.incident_id}</small>
          </div>
          <span className={`assistant-v2-priority ${priorityTone(incident.risk_level)}`}>{priorityLabel(incident.risk_level)}</span>
        </div>
        <p className="assistant-v2-status-copy">{status.detail}</p>
        {status.deliveryDetail && <p className="assistant-v2-delivery-copy">{status.deliveryDetail}</p>}
        <span className={`assistant-v2-connection ${networkMode === "offline" ? "offline" : "online"}`}>
          {networkMode === "offline" ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />} {connectionLabel}
        </span>
      </header>

      <div className="incident-mode-switcher assistant-v2-switch" role="tablist" aria-label="Mode Asisten saat SOS aktif">
        <button type="button" role="tab" aria-selected={mode === "assistant"} className={mode === "assistant" ? "active" : ""} onClick={() => setMode("assistant")}>Asisten</button>
        <button type="button" role="tab" aria-selected={mode === "responder"} className={mode === "responder" ? "active" : ""} onClick={() => setMode("responder")}><BellRing aria-hidden="true" /> Responder</button>
      </div>

      {mode === "assistant" ? (
        <ActiveIncidentAssistant
          incident={incident}
          networkMode={networkMode}
          connectivity={connectivity}
          hazardFeed={hazardFeed}
          onOpenMap={onOpenMap}
          onOpenResponder={(draft) => {
            if (draft) setDraftSeed({ key: Date.now(), text: draft });
            setMode("responder");
          }}
        />
      ) : (
        <div className="assistant-responder-panel">
          <MessagesPage
            reportState={reportState}
            networkMode={networkMode}
            connectivity={connectivity}
            onCreateSos={onCreateSos}
            incidentOverride={incident}
            embedded
            draftSeed={draftSeed}
          />
        </div>
      )}
    </div>
  );
}

function AssistantHome({
  networkMode,
  location,
  hazardFeed,
  onCreateSos,
  onOpenMap,
}: {
  networkMode: NetworkMode;
  location: LocationSnapshot | null;
  hazardFeed: LiveHazardFeed | null;
  onCreateSos: () => void;
  onOpenMap: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<AssistantEntry[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [important, setImportant] = useState<string[]>([]);
  const availableHazards = hazardFeed?.alerts.length ?? 0;

  const capabilityCopy = useMemo(() => {
    if (networkMode === "offline") return "Mode lokal · panduan dan analisis dasar tersedia di perangkat";
    return availableHazards > 0 ? `Bantuan lokal tersedia · ${availableHazards} informasi kondisi tersedia` : "Bantuan lokal tersedia";
  }, [availableHazards, networkMode]);

  const [busy,setBusy]=useState(false);
  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const {response,local}=await hybridAnswer(text,hazardFeed);
    setBusy(false);
    const parsed = parseEmergencyDescription(text);
    const signals = detectSafetySignals(text);
    const seriousSignals = signals.filter((signal) => ["NOT_BREATHING", "UNCONTROLLED_BLEEDING", "UNCONSCIOUS", "TRAPPED", "FIRE_SMOKE"].includes(signal.id));
    const shouldRecommendSos = seriousSignals.length > 0 || parsed.mobilityLimited || parsed.waterLevel >= 70;
    const facts = [
      ...seriousSignals.map((signal) => signal.reason),
      parsed.mobilityLimited ? "ada keterbatasan mobilitas" : null,
      parsed.waterLevel >= 70 ? "ketinggian air berisiko" : null,
    ].filter((item): item is string => Boolean(item));
    const emergency = emergencyResponse(text);
    setImportant(emergency ? (emergency.recommendSos ? emergency.hazards.map((hazard) => `Indikasi ${hazard}; konfirmasikan kondisi Anda`) : []) : shouldRecommendSos ? [...new Set(facts)] : []);
    if(local.negatedTypes.length||local.educational)setImportant([]);
    setEntries((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", text, source: null },
      { id: `a-${Date.now()}-${Math.random()}`, role: "assistant", text: response.text, source: response.source },
    ]);
    setDraft("");
  };

  return (
    <div className="assistant-home" data-state="NO_ACTIVE_INCIDENT">
      <header className="assistant-home-intro">
        <div className="assistant-identity"><span><Sparkles /></span><div><small>ASISTEN nuRESQ</small><h2>Panduan untuk situasi Anda</h2></div></div>
        <p className="assistant-capability"><i /> {capabilityCopy}</p>
        <LocalAIStatus />
        {location && <small className="assistant-location"><MapPin /> Konteks lokasi tersedia · {location.label}</small>}
      </header>

      <section className="assistant-actions-section">
        <div className="assistant-section-heading"><span>APA YANG INGIN ANDA LAKUKAN?</span></div>
        <div className="assistant-quick-actions">
          <button type="button" onClick={() => setGuideOpen((value) => !value)}><span><BookOpenCheck /></span><div><strong>Panduan Darurat</strong><small>Baca panduan yang tersimpan di perangkat</small></div><ChevronRight /></button>
          <button type="button" onClick={() => {
            const response = localAnswer("cek kondisi sekitar", hazardFeed);
            setEntries((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: response.text, source: response.source }]);
          }}><span><ShieldAlert /></span><div><strong>Cek Kondisi Sekitar</strong><small>Gunakan data kondisi yang benar-benar tersedia</small></div><ChevronRight /></button>
          <button type="button" onClick={onOpenMap}><span><MapPin /></span><div><strong>Cari Tempat Aman</strong><small>Buka titik referensi di Peta</small></div><ChevronRight /></button>
          <button type="button" onClick={() => document.getElementById("assistant-general-input")?.focus()}><span><MessageSquareText /></span><div><strong>Ceritakan Kondisi</strong><small>Analisis lokal tanpa membuat SOS otomatis</small></div><ChevronRight /></button>
        </div>
      </section>

      {guideOpen && (
        <section className="assistant-guide-panel">
          <span>PANDUAN OFFLINE</span>
          {fieldGuides.map((guide) => <details key={guide.id}><summary>{guide.title}<ChevronRight /></summary><p>{guide.summary}</p><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></details>)}
        </section>
      )}

      {entries.length > 0 && (
        <section className="assistant-conversation" aria-live="polite">
          {entries.map((entry) => <article key={entry.id} className={entry.role}><span>{entry.role === "assistant" ? <Sparkles /> : null}{entry.role === "assistant" ? "ASISTEN" : "ANDA"}</span><p>{entry.text}</p>{entry.source && <small>{entry.source}</small>}</article>)}
        </section>
      )}

      {important.length > 0 && (
        <aside className="assistant-sos-recommendation" role="alert">
          <ShieldAlert />
          <div><span>KONDISI PENTING TERDETEKSI</span><strong>Pertimbangkan laporan SOS bila Anda membutuhkan pertolongan segera.</strong><ul>{important.map((fact) => <li key={fact}>{fact}</li>)}</ul><div><button type="button" onClick={onCreateSos}><ShieldAlert /> Buat Laporan SOS</button><button type="button" onClick={() => setImportant([])}>Tetap di Asisten</button></div></div>
        </aside>
      )}

      <form className="assistant-general-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div><textarea id="assistant-general-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={1000} placeholder="Tanyakan atau ceritakan kondisi…" aria-label="Tanyakan atau ceritakan kondisi kepada Asisten nuRESQ" /><button type="submit" disabled={!draft.trim()} aria-label="Proses dengan bantuan lokal"><Send /></button></div>
        <small><Sparkles /> Analisis lokal didahulukan. Saat online, teks dapat diproses backend; tidak dikirim ke responder.</small>
      </form>

      <aside className="assistant-responder-note"><BellRing /><div><strong>Komunikasi responder</strong><span>Tersedia setelah laporan SOS dibuat. Pertanyaan kepada Asisten tidak membuat kanal responder.</span></div><button type="button" onClick={onCreateSos}>SOS</button></aside>
    </div>
  );
}

function ActiveIncidentAssistant({
  incident,
  networkMode,
  connectivity,
  hazardFeed,
  onOpenMap,
  onOpenResponder,
}: {
  incident: EmergencyIncident;
  networkMode: NetworkMode;
  connectivity: ConnectivityReport;
  hazardFeed: LiveHazardFeed | null;
  onOpenMap: () => void;
  onOpenResponder: (draft?: string) => void;
}) {
  const [result, setResult] = useState<{ text: string; source: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<AssistantEntry[]>([]);
  const facts = useMemo(() => conditionFacts(incident), [incident]);
  const conditionDescription = facts.length < 2 && incident.description.trim() ? incident.description.trim() : null;
  const waitingGuide = fieldGuides.find((item) => item.id === "waiting") ?? fieldGuides[0];

  const submit = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text) return;
    const {response} = await hybridAnswer(text,hazardFeed,incident);
    setEntries((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", text, source: null },
      { id: `a-${Date.now()}-${Math.random()}`, role: "assistant", text: response.text, source: response.source },
    ]);
    setResult(null);
    setDraft("");
  };

  const transportCopy = networkMode === "offline"
    ? "Mode lokal · pesan responder akan diantrikan"
    : connectivity.state === "CONNECTED"
      ? "Online · komunikasi responder tersedia"
      : "Jaringan terbatas · status pengiriman tetap diverifikasi";

  return (
    <div className="assistant-incident-panel assistant-v2-panel">
      <section className="assistant-v2-condition" aria-labelledby="assistant-condition-title">
        <span className="assistant-v2-section-kicker">KONDISI ANDA</span>
        <h3 id="assistant-condition-title">{incident.type ?? "Insiden darurat"}</h3>
        {facts.length > 0 && <div className="assistant-v2-facts">{facts.map((fact) => <span key={fact.id} className={fact.tone ?? ""}>{fact.text}</span>)}</div>}
        {conditionDescription && <p className="assistant-v2-condition-description">{conditionDescription}</p>}
        {!facts.length && !conditionDescription && <p className="assistant-v2-condition-description">Detail kondisi belum tersedia pada laporan aktif.</p>}
        <button type="button" className="assistant-v2-update" onClick={() => onOpenResponder("Kondisi terbaru: ")}><MessageSquareText aria-hidden="true" /> Perbarui kondisi</button>
      </section>

      <section className="assistant-v2-help">
        <div className="assistant-v2-help-heading"><span>Apa yang ingin dibantu?</span><small>Gunakan konteks SOS yang sudah Anda laporkan.</small></div>
        <div className="assistant-v2-quick-actions">
          <button type="button" onClick={() => setResult({ text: conciseIncidentSummary(incident), source: "Laporan SOS Anda" })}><MessageSquareText aria-hidden="true" /><span>Ringkas</span></button>
          <button type="button" onClick={() => setResult({ text: `${waitingGuide.title}: ${waitingGuide.steps.join(" ")}`, source: "Panduan Offline" })}><BookOpenCheck aria-hidden="true" /><span>Panduan</span></button>
          <button type="button" onClick={onOpenMap}><MapPin aria-hidden="true" /><span>Peta</span></button>
        </div>
      </section>

      {result && (
        <section className="assistant-v2-inline-response" aria-live="polite">
          <div><Sparkles aria-hidden="true" /><strong>Asisten nuRESQ</strong></div>
          <p>{result.text}</p>
          <small>{result.source}</small>
        </section>
      )}

      {entries.length === 0 ? (
        <div className="assistant-v2-suggestions" aria-label="Saran pertanyaan">
          <button type="button" onClick={() => submit("Apa yang harus saya lakukan sekarang?")}>Apa yang harus saya lakukan sekarang?</button>
          <button type="button" onClick={() => submit("Ringkas kondisi saya")}>Ringkas kondisi saya</button>
          <button type="button" onClick={() => submit("Panduan menunggu bantuan")}>Panduan menunggu bantuan</button>
        </div>
      ) : (
        <section className="assistant-v2-conversation" aria-live="polite">
          {entries.map((entry) => (
            <article key={entry.id} className={entry.role}>
              <span>{entry.role === "assistant" ? "ASISTEN" : "ANDA"}</span>
              <p>{entry.text}</p>
              {entry.source && <small>{entry.source}</small>}
            </article>
          ))}
        </section>
      )}

      <form className="assistant-v2-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={1000} placeholder="Tanyakan tentang kondisi atau langkah selanjutnya…" aria-label="Tanyakan tentang kondisi atau langkah selanjutnya" />
        <button type="submit" disabled={!draft.trim()} aria-label="Kirim ke Asisten nuRESQ"><Send aria-hidden="true" /></button>
      </form>

      <footer className="assistant-v2-transport-status">
        {networkMode === "offline" ? <WifiOff aria-hidden="true" /> : <RadioTower aria-hidden="true" />}
        <span>{transportCopy}</span>
      </footer>
    </div>
  );
}
