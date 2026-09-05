"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { ConnectivityReport } from "@/lib/nuresq/connectivity";
import type { EmergencyIncident, NetworkMode } from "@/lib/nuresq/types";
import type { EmergencyMessage } from "@/lib/nuresq/message-types";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import {
  compactEmergencyMessage,
  simplifyResponderMessage,
  summarizeEmergencyContext,
} from "@/lib/nuresq/message-analysis";
import { useEmergencyMessages } from "@/hooks/useEmergencyMessages";
import { AIInsightPanel } from "./AIInsightPanel";
import { ConversationList } from "./ConversationList";
import { IncidentMessageHeader } from "./IncidentMessageHeader";
import {
  AIAssistSheet,
  DeliveryDetailSheet,
  IncidentUpdateDialog,
  type AssistAction,
  type AssistResult,
} from "./MessageSheets";
import { SmartMessageComposer } from "./SmartMessageComposer";

interface SpeechRecognitionResultLike {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface MessageDraftSeed {
  key: number;
  text: string;
}

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function latestActionableInsight(messages: EmergencyMessage[]) {
  const blocked = new Set(messages
    .filter((message) => message.structuredUpdate?.dismissedAt || message.structuredUpdate?.status === "CONFIRMED")
    .map((message) => message.structuredUpdate!.signature));
  return [...messages].reverse().find((message) => {
    const update = message.structuredUpdate;
    return Boolean(update && update.status === "SUGGESTED" && !update.dismissedAt && !blocked.has(update.signature));
  }) ?? null;
}

export function MessagesPage({
  reportState,
  networkMode,
  connectivity,
  onCreateSos,
  incidentOverride,
  embedded = false,
  draftSeed,
}: {
  reportState: "idle" | "queued" | "ready";
  networkMode: NetworkMode;
  connectivity: ConnectivityReport;
  onCreateSos: () => void;
  incidentOverride?: EmergencyIncident | null;
  embedded?: boolean;
  draftSeed?: MessageDraftSeed | null;
}) {
  const [incident, setIncident] = useState<EmergencyIncident | null>(null);
  const [incidentLoading, setIncidentLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistResult, setAssistResult] = useState<AssistResult | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<EmergencyMessage | null>(null);
  const [updateMessage, setUpdateMessage] = useState<EmergencyMessage | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updatingIncident, setUpdatingIncident] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messaging = useEmergencyMessages(incident, connectivity.state);

  useEffect(() => {
    if (incidentOverride !== undefined) {
      setIncident(incidentOverride);
      setIncidentLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIncidentLoading(true);
      void EmergencyRepository.getActiveIncident().then((activeIncident) => {
        if (!cancelled) setIncident(activeIncident);
      }).catch(() => {
        if (!cancelled) setIncident(null);
      }).finally(() => {
        if (!cancelled) setIncidentLoading(false);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [incidentOverride, reportState]);

  useEffect(() => {
    if (!draftSeed) return;
    setDraft((current) => current.trim() ? current : draftSeed.text);
  }, [draftSeed?.key, draftSeed?.text]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const insight = useMemo(() => latestActionableInsight(messaging.messages), [messaging.messages]);
  const latestResponder = useMemo(() => [...messaging.messages].reverse().find((message) => (
    message.senderType === "RESPONDER_MESSAGE" && Boolean(message.responderReceiptId)
  )) ?? null, [messaging.messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const message = await messaging.sendText(text);
      setDraft("");
      if (message.deliveryState === "SERVER_ACKNOWLEDGED") toast.success("Pesan diterima sistem");
      else if (message.deliveryState === "GATEWAY_RECEIVED") toast.success("Gateway menerima pesan");
      else toast.success("Pesan tersimpan di perangkat", { description: "Menunggu jalur pengiriman yang dapat memberikan ACK." });
    } catch {
      toast.error("Pesan belum dapat disimpan", { description: "Teks tetap tersedia. Coba lagi setelah ruang penyimpanan diperiksa." });
    } finally {
      setSending(false);
    }
  }, [draft, messaging, sending]);

  const reviewUpdate = useCallback((message: EmergencyMessage) => {
    setUpdateMessage(message);
    setUpdateOpen(true);
  }, []);

  const dismissInsight = useCallback(async (message: EmergencyMessage) => {
    try {
      await messaging.dismissInsight(message);
    } catch {
      toast.error("Insight belum dapat ditutup", {
        description: "Penyimpanan perangkat belum dapat diperbarui. Coba lagi.",
      });
    }
  }, [messaging]);

  const confirmUpdate = useCallback(async () => {
    if (!updateMessage) return;
    setUpdatingIncident(true);
    try {
      const updated = await messaging.confirmIncidentUpdate(updateMessage);
      setIncident(updated.incident);
      setUpdateOpen(false);
      toast.success("Kondisi insiden diperbarui", { description: `${updated.safety.engineLabel}: ${updated.safety.level}` });
    } catch {
      toast.error("Pembaruan belum dapat disimpan");
    } finally {
      setUpdatingIncident(false);
    }
  }, [messaging, updateMessage]);

  const assistAction = useCallback((action: AssistAction) => {
    if (!incident) return;
    const userMessages = messaging.messages.filter((message) => message.senderType === "USER_MESSAGE");
    const lastUser = userMessages.at(-1) ?? null;
    if (action === "summary") {
      setAssistResult({
        title: "Ringkasan kondisi",
        body: summarizeEmergencyContext(incident, messaging.messages),
        source: "Sumber: laporan dan pesan Anda.",
        usableText: null,
      });
      return;
    }
    if (action === "update") {
      const candidate = [...userMessages].reverse().find((message) => message.structuredUpdate?.status === "SUGGESTED");
      if (!candidate) {
        setAssistResult({ title: "Belum ada pembaruan", body: "Kirim perubahan kondisi terlebih dahulu. Sistem tidak akan mengarang fakta yang belum dilaporkan.", source: "Mode lokal", usableText: null });
        return;
      }
      setAssistOpen(false);
      reviewUpdate(candidate);
      return;
    }
    if (action === "changes") {
      const facts = lastUser?.structuredUpdate?.facts ?? [];
      setAssistResult({
        title: facts.length ? `${facts.length} perubahan penting` : "Belum ada perubahan terstruktur",
        body: facts.length
          ? facts.map((item) => `${item.label}: ${item.previousValue ?? "belum diketahui"} → ${item.value}`).join("\n")
          : "Pesan terbaru belum memuat perubahan kondisi yang dapat dipastikan.",
        source: "Perbandingan laporan awal dan pesan terbaru.",
        usableText: null,
      });
      return;
    }
    if (action === "compact") {
      const source = draft.trim() || userMessages.slice(-3).map((message) => message.text).join(". ");
      setAssistResult({
        title: "Versi ringkas",
        body: source ? compactEmergencyMessage(source, incident.description) : "Tulis kondisi terlebih dahulu agar dapat diringkas tanpa mengarang fakta.",
        source: "Untuk mode data minimum.",
        usableText: source ? compactEmergencyMessage(source, incident.description) : null,
      });
      return;
    }
    const explanation = latestResponder ? simplifyResponderMessage(latestResponder.text) : "Belum ada pesan responder terverifikasi untuk dijelaskan.";
    setAssistResult({ title: "Penjelasan sederhana", body: explanation, source: "Makna dipertahankan dari pesan responder terverifikasi.", usableText: null });
  }, [draft, incident, latestResponder, messaging.messages, reviewUpdate]);

  const voice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (networkMode === "offline") {
      toast.info("Dikte suara offline belum tersedia", { description: "Gunakan input teks; analisis lokal tetap dapat digunakan setelah pesan dibuat." });
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      toast.info("Input suara belum tersedia di perangkat ini");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) setDraft((current) => [current.trim(), transcript].filter(Boolean).join(" "));
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setListening(false); recognitionRef.current = null; toast.error("Input suara tidak dapat digunakan"); };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening, networkMode]);

  if (incidentLoading) {
    return <div className="message-center loading-page" aria-label="Memuat pusat pesan"><i /><i /><i /></div>;
  }

  if (!incident) {
    return (
      <div className="message-center no-incident">
        <div className="message-no-incident">
          <span><MessageSquareText aria-hidden="true" /></span>
          <p className="eyebrow">KOMUNIKASI DARURAT</p>
          <h2>Belum ada insiden aktif.</h2>
          <p>Buat laporan SOS terlebih dahulu untuk memulai komunikasi insiden. nuRESQ tidak akan membuat responder atau status pengiriman palsu.</p>
          <button type="button" onClick={onCreateSos}><ShieldAlert aria-hidden="true" /> Buat Laporan SOS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-center">
      {!embedded && <IncidentMessageHeader
        incident={incident}
        connectivity={connectivity.state}
        backendAvailable={messaging.capabilityState.backendAvailable}
        relayAvailable={messaging.capabilityState.relayAvailable}
      />}
      {insight && (
        <AIInsightPanel
          message={insight}
          localModelAvailable={messaging.capabilityState.localModelAvailable}
          onReview={reviewUpdate}
          onDismiss={(message) => void dismissInsight(message)}
        />
      )}
      {messaging.storageError && <div className="message-storage-error" role="alert"><ShieldAlert aria-hidden="true" /><span><strong>{messaging.storageError}</strong><button type="button" onClick={() => void messaging.refresh()}>Coba lagi</button></span></div>}
      <ConversationList
        messages={messaging.messages}
        loading={messaging.loading}
        onDeliveryDetail={setDeliveryMessage}
        onQuickCondition={() => setDraft("Kondisi terbaru: ")}
        onQuickCompact={() => { setAssistOpen(true); assistAction("compact"); }}
      />
      <SmartMessageComposer
        value={draft}
        networkMode={networkMode}
        relayAvailable={messaging.capabilityState.relayAvailable}
        listening={listening}
        sending={sending}
        onChange={setDraft}
        onSend={() => void send()}
        onAssist={() => { setAssistResult(null); setAssistOpen(true); }}
        onVoice={voice}
      />

      <AIAssistSheet
        open={assistOpen}
        onOpenChange={setAssistOpen}
        localModelAvailable={messaging.capabilityState.localModelAvailable}
        cloudCoordinatorAvailable={messaging.capabilityState.cloudCoordinatorAvailable}
        responderAvailable={Boolean(latestResponder)}
        result={assistResult}
        onAction={assistAction}
        onUseResult={(text) => { setDraft(text); setAssistOpen(false); }}
      />
      <DeliveryDetailSheet message={deliveryMessage} onOpenChange={(open) => { if (!open) setDeliveryMessage(null); }} />
      <IncidentUpdateDialog
        message={updateMessage}
        open={updateOpen}
        saving={updatingIncident}
        onOpenChange={setUpdateOpen}
        onConfirm={() => void confirmUpdate()}
      />
    </div>
  );
}
