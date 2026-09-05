"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Flame,
  HeartPulse,
  Mic,
  Mountain,
  Radio,
  Send,
  ShieldCheck,
  Waves,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { hasVerifiedAcknowledgement } from '@/lib/nuresq/delivery';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { incidentTypes } from "@/lib/nuresq/mock-data";
import { calculateRisk, parseEmergencyDescription } from "@/lib/nuresq/safety";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import type { ConnectivityState, EmergencyIncident, IncidentType, LocationSnapshot, NetworkMode, SosDraft } from "@/lib/nuresq/types";
import { InjuryScanner } from "./InjuryScanner";
import { analyzeLocally } from '@/lib/nuresq/ai/EmergencyPipeline';

const typeIcons = [Waves, Zap, Mountain, Flame, HeartPulse, AlertTriangle];

const initialDraft: SosDraft = {
  type: null,
  description: "",
  victimCount: null,
  mobilityLimited: false,
  waterLevel: 0,
  injuryAssessment: null,
};

const deliveryLabels = [
  "Menyusun ringkasan",
  "Menyimpan di IndexedDB",
  "Menyiapkan antrean pengiriman",
  "Siap dibagikan manual",
];

interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognizerConstructor = new () => SpeechRecognizer;

interface SosFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkMode: NetworkMode;
  connectivityState: ConnectivityState;
  location: LocationSnapshot | null;
  onSent: (queued: boolean, incident: EmergencyIncident | null) => void;
}

export function SosFlow({ open, onOpenChange, networkMode, connectivityState, location, onSent }: SosFlowProps) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SosDraft>(initialDraft);
  const [deliveryStep, setDeliveryStep] = useState(0);
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedIncident, setSavedIncident] = useState<EmergencyIncident | null>(null);
  const acknowledged = Boolean(savedIncident && hasVerifiedAcknowledgement(savedIncident));
  useEffect(() => {
    if(!savedIncident?.incident_id)return;
    let cancelled=false;
    const refresh=()=>{void EmergencyRepository.getIncidentHistory().then(items=>{const latest=items.find(item=>item.incident_id===savedIncident.incident_id);if(latest&&!cancelled)setSavedIncident(latest);}).catch(()=>undefined);};
    window.addEventListener('nuresq-repository-change',refresh);refresh();
    return ()=>{cancelled=true;window.removeEventListener('nuresq-repository-change',refresh);};
  },[savedIncident?.incident_id]);

  const requestClose = (next: boolean) => {
    if (next) { onOpenChange(true); return; }
    if (saving) return;
    if (savedIncident) {
      if (!window.confirm("Tutup ringkasan SOS? Laporan tetap aktif dan tersimpan di perangkat; belum ada konfirmasi bantuan.")) return;
      onSent(networkMode === "offline", savedIncident);
    } else if ((draft.type || draft.description.trim() || draft.injuryAssessment) && !window.confirm("Tutup laporan yang belum disimpan? Isian ini akan hilang.")) return;
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open || (!draft.type && !draft.description && !savedIncident)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, draft.type, draft.description, savedIncident]);

  const risk = useMemo(() => calculateRisk(draft), [draft]);

  useEffect(() => {
    if (!open) {
      const reset = window.setTimeout(() => {
        setStep(0);
        setDraft(initialDraft);
        setDeliveryStep(0);
        setSavedIncident(null);
      }, 220);
      return () => window.clearTimeout(reset);
    }
  }, [open]);

  useEffect(() => {
    if (step !== 3) return;
    const timer = window.setInterval(() => {
      setDeliveryStep((current) => {
        if (current >= deliveryLabels.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 620);
    return () => window.clearInterval(timer);
  }, [step]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const analysis = await analyzeLocally(draft.description,draft.type);
      setDraft((current) => ({ ...current, ...analysis.parsed, description:analysis.text }));
      setAnalyzing(false);
      setStep(2);
    } catch {setAnalyzing(false);setStep(2);}
  };

  const confirmSend = async () => {
    if (saving) return;
    setSaving(true);
    const capsule: EmergencyIncident = {
      incident_id: `NR-${crypto.randomUUID()}`,
      incident_lifecycle: "ACTIVE",
      type: draft.type,
      description: draft.description,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_trust: location?.mode ?? "UNAVAILABLE",
      location_accuracy_m: location?.accuracy ?? null,
      location_updated_at: location ? new Date(location.updatedAt).toISOString() : null,
      victim_count: draft.victimCount,
      mobility: draft.mobilityLimited ? "terbatas" : "normal",
      risk_level: risk.level,
      requested_help: "evakuasi",
      injury_triage: draft.injuryAssessment ? {
        priority: draft.injuryAssessment.priority,
        red_flags: draft.injuryAssessment.redFlags,
        reasons: draft.injuryAssessment.reasons,
        photo_uploaded: false,
      } : null,
      timestamp: new Date().toISOString(),
      connectivity_state: connectivityState,
      delivery_status: "LOCAL_SAVED",
      delivery_capability: "DELIVERY_NOT_CONFIGURED",
      acknowledgement: null,
      last_delivery_attempt_at: null,
    };
    try {
      await EmergencyRepository.saveIncident(capsule);
      setSavedIncident(capsule);
      navigator.vibrate?.(70);
      setDeliveryStep(0);
      setStep(3);
    } catch {
      toast.error("Laporan belum tersimpan", { description: "Penyimpanan darurat browser tidak tersedia. Jangan tutup layar ini." });
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    const queued = networkMode === "offline";
    toast.success("SOS aktif", {
      description: acknowledged ? "Sistem telah menerima laporan. Ini bukan konfirmasi petugas." : queued
        ? "Tersimpan di perangkat dan menunggu jalur pengiriman."
        : "Belum ada konfirmasi dari sistem.",
    });
    onSent(queued, savedIncident);
    onOpenChange(false);
  };

  const startVoice = () => {
    if (recording) return;
    if (networkMode === "offline") {
      toast.info("Dikte suara offline belum tersedia", { description: "Gunakan input teks; penilaian keselamatan tetap berjalan di perangkat." });
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognizerConstructor;
      webkitSpeechRecognition?: SpeechRecognizerConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("Dikte suara tidak didukung browser ini", { description: "Ketik kondisi singkat pada kolom laporan." });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setRecording(true);
    recognition.onresult = (event: unknown) => {
      const result = event as { results?: ArrayLike<{ 0?: { transcript?: string } }> };
      const transcript = result.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) setDraft((current) => ({ ...current, description: transcript }));
      navigator.vibrate?.(45);
    };
    recognition.onerror = () => toast.error("Suara belum dapat dikenali");
    recognition.onend = () => {
      setRecording(false);
    };
    recognition.start();
  };

  const isDeliveryFinished = deliveryStep >= deliveryLabels.length;

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="sos-dialog"
        showCloseButton={step < 3}
        onPointerDownOutside={(event) => step === 3 && event.preventDefault()}
      >
        <DialogHeader className="sos-dialog-header">
          <div className="dialog-kicker">
            {step > 0 && step < 3 ? (
              <button type="button" onClick={() => setStep((current) => current - 1)} aria-label="Kembali">
                <ChevronLeft />
              </button>
            ) : (
              <span className="emergency-dot" />
            )}
            <span>Laporan darurat</span>
            <span className="step-count">{Math.min(step + 1, 4)}/4</span>
          </div>
          <Progress value={(Math.min(step + 1, 4) / 4) * 100} className="sos-step-progress" />
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="sos-motion-step"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >

        {step === 0 && (
          <div className="sos-step">
            <DialogTitle>Apa yang terjadi?</DialogTitle>
            <DialogDescription>Pilih satu jenis kejadian yang paling sesuai.</DialogDescription>
            <div className="incident-type-grid">
              {incidentTypes.map((type, index) => {
                const Icon = typeIcons[index];
                return (
                  <motion.button
                    type="button"
                    key={type}
                    className={draft.type === type ? "selected" : ""}
                    onClick={() => setDraft((current) => ({ ...current, type: type as IncidentType }))}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : index * 0.035 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.975 }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{type}</span>
                    {draft.type === type && <Check className="choice-check" />}
                  </motion.button>
                );
              })}
            </div>
            <button type="button" className="primary-action" disabled={!draft.type} onClick={() => setStep(1)}>
              Lanjutkan
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="sos-step">
            <DialogTitle>Ceritakan kondisi Anda</DialogTitle>
            <DialogDescription>Cukup singkat. Sebutkan jumlah orang dan kondisi yang paling mendesak.</DialogDescription>
            <div className="emergency-input-wrap">
              <Textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Contoh: Kami terjebak banjir, ada 2 orang dan satu orang tidak bisa berjalan."
                className="emergency-textarea"
                autoFocus
              />
              <button type="button" className={`voice-button ${recording ? "recording" : ""}`} onClick={startVoice} disabled={recording || networkMode === "offline"} title={networkMode === "offline" ? "Dikte suara offline belum tersedia" : "Input suara memakai capability browser"}>
                <Mic aria-hidden="true" />
                {recording ? "Mendengarkan…" : networkMode === "offline" ? "Dikte offline belum tersedia" : "Gunakan suara"}
                {recording && <span className="voice-waveform" aria-hidden="true">{[0, 1, 2, 3, 4].map((bar) => <i key={bar} style={{ "--wave-delay": `${bar * 70}ms` } as React.CSSProperties} />)}</span>}
              </button>
            </div>
            <InjuryScanner
              value={draft.injuryAssessment}
              onChange={(injuryAssessment) => setDraft((current) => ({ ...current, injuryAssessment }))}
            />
            <p className="privacy-note">Ringkasan dan triage berbasis aturan diproses di perangkat. Bukan diagnosis medis.</p>
            <button type="button" className="primary-action" disabled={(draft.description.trim().length < 8 && !draft.injuryAssessment) || analyzing} onClick={analyze}>
              {analyzing ? "Menyusun ringkasan…" : "Buat ringkasan lokal"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="sos-step">
            <DialogTitle>Periksa sebelum disimpan</DialogTitle>
            <DialogDescription>Pastikan ringkasan ini sesuai dengan kondisi Anda.</DialogDescription>
            <div className={`risk-banner ${risk.tone}`}>
              <AlertTriangle aria-hidden="true" />
              <div>
                <small>HASIL TRIAGE KESELAMATAN</small>
                <strong>{risk.level}</strong>
              </div>
            </div>
            <div className="safety-engine-note">
              <ShieldCheck aria-hidden="true" />
              <div><strong>{risk.engineLabel}</strong><span>Ringkasan dan level risiko ditentukan oleh aturan lokal yang dapat diperiksa.</span></div>
            </div>
            <dl className="summary-list">
              <div><dt>Kejadian</dt><dd>{draft.type}</dd></div>
              <div>
                <dt>Korban</dt>
                <dd>{draft.victimCount === null ? "Belum diketahui" : `${draft.victimCount} orang`}</dd>
              </div>
              <div><dt>Mobilitas</dt><dd>{draft.mobilityLimited ? "1 orang terbatas" : "Tidak dilaporkan"}</dd></div>
              {draft.waterLevel > 0 && <div><dt>Ketinggian air</dt><dd>±{draft.waterLevel} cm</dd></div>}
              {draft.injuryAssessment && (
                <div><dt>Scan luka</dt><dd>{draft.injuryAssessment.priority === "kritis" ? "Prioritas kritis" : draft.injuryAssessment.priority === "tinggi" ? "Prioritas tinggi" : "Perlu dipantau"}</dd></div>
              )}
              <div>
                <dt>Lokasi</dt>
                <dd>
                  {!location
                    ? "Lokasi belum tersedia"
                    : location.mode === "GPS_TRUSTED"
                      ? `GPS tepercaya · ±${Math.round(location.accuracy ?? 0)} m`
                      : location.mode === "GPS_LOW_ACCURACY"
                        ? `GPS akurasi rendah · ±${Math.round(location.accuracy ?? 0)} m`
                        : `Lokasi terakhir · ${Math.floor(location.ageMs / 60_000)} menit lalu`}
                </dd>
              </div>
            </dl>
            {draft.victimCount === null && (
              <label className="victim-count-confirm">
                <span>Berapa orang yang membutuhkan bantuan? <small>Opsional bila belum diketahui</small></span>
                <input type="number" min="1" max="99" inputMode="numeric" placeholder="Belum diketahui" onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setDraft((current) => ({ ...current, victimCount: Number.isFinite(value) && value > 0 ? value : null }));
                }} />
              </label>
            )}
            <div className="why-box">
              <strong>Kenapa prioritas ini?</strong>
              <ul>{risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
            <button type="button" className="primary-action send" onClick={() => void confirmSend()} disabled={saving}>
              <Send aria-hidden="true" /> {saving ? "Menyimpan…" : "Simpan Laporan SOS"}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="sos-step delivery-step">
            <div className="delivery-symbol"><Radio aria-hidden="true" /></div>
            <DialogTitle>SOS aktif</DialogTitle>
            <DialogDescription>
              {acknowledged ? "Sistem telah menerima laporan. Permintaan tetap aktif; belum ada konfirmasi petugas." : networkMode === "offline"
                ? "Permintaan bantuan masih aktif. Tersimpan di perangkat dan menunggu jalur pengiriman."
                : "Permintaan bantuan masih aktif. Laporan tersimpan di perangkat dan belum mendapat konfirmasi sistem."}
            </DialogDescription>
            <ol className="delivery-list">
              {deliveryLabels.map((label, index) => {
                const done = index < deliveryStep;
                const active = index === deliveryStep;
                return (
                  <motion.li key={label} layout className={`${done ? "done" : ""} ${active ? "active" : ""}`}>
                    <motion.span animate={done && !reduceMotion ? { scale: [0.75, 1.08, 1] } : { scale: 1 }}>{done ? <Check /> : index + 1}</motion.span>
                    <div><strong>{label}</strong>{index === 2 && <small>{acknowledged ? 'ACK sistem diterima' : 'Pengiriman dilanjutkan ketika layanan tersedia'}</small>}</div>
                  </motion.li>
                );
              })}
            </ol>
            <button type="button" className="primary-action" disabled={!isDeliveryFinished} onClick={finish}>
              Kembali ke Beranda
            </button>
          </div>
        )}
        </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
