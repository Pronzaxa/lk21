"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  ImagePlus,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  emptyInjuryFlags,
  evaluateInjuryAssessment,
} from "@/lib/nuresq/injury-scan";
import type {
  InjuryAssessment,
  InjuryRedFlags,
  InjuryVisualCheck,
} from "@/lib/nuresq/types";

interface InjuryScannerProps {
  value: InjuryAssessment | null;
  onChange: (assessment: InjuryAssessment | null) => void;
}

const checklist: Array<{ key: keyof InjuryRedFlags; label: string; detail: string }> = [
  { key: "uncontrolledBleeding", label: "Perdarahan tidak berhenti", detail: "Darah terus keluar meski sudah ditekan" },
  { key: "unconscious", label: "Tidak sadar / tidak merespons", detail: "Korban tidak menjawab saat dipanggil" },
  { key: "breathingDifficulty", label: "Sulit bernapas", detail: "Napas tidak normal, tersengal, atau berhenti" },
  { key: "suspectedFracture", label: "Diduga patah tulang", detail: "Bentuk tidak normal atau nyeri berat setelah benturan" },
];

async function inspectImage(file: File): Promise<InjuryVisualCheck> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 420;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Canvas unavailable");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  let luminanceSum = 0;
  let luminanceSquared = 0;
  let redPixels = 0;
  let samples = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminanceSum += luminance;
    luminanceSquared += luminance ** 2;
    if (red > 90 && red > green * 1.22 && red > blue * 1.18) redPixels += 1;
    samples += 1;
  }

  const brightness = luminanceSum / Math.max(1, samples);
  const contrast = Math.sqrt(Math.max(0, luminanceSquared / Math.max(1, samples) - brightness ** 2));
  const quality = brightness < 42 || brightness > 238 || contrast < 17 ? "ulang" : "cukup";
  return {
    brightness: Math.round(brightness),
    contrast: Math.round(contrast),
    redPixelRatio: redPixels / Math.max(1, samples),
    quality,
  };
}

export function InjuryScanner({ value, onChange }: InjuryScannerProps) {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(Boolean(value));
  const [preview, setPreview] = useState<string | null>(null);
  const [visual, setVisual] = useState<InjuryVisualCheck | null>(value?.visual ?? null);
  const [flags, setFlags] = useState<InjuryRedFlags>(value?.redFlags ?? emptyInjuryFlags);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const selectPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pilih file foto JPG, PNG, atau WebP.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    onChange(null);
    try {
      const nextVisual = await inspectImage(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      setVisual(nextVisual);
    } catch {
      setError("Foto tidak dapat dibaca. Ambil ulang dengan kamera.");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleFlag = (key: keyof InjuryRedFlags) => {
    setFlags((current) => ({ ...current, [key]: !current[key] }));
    onChange(null);
  };

  const assess = () => {
    if (!visual) return;
    const assessment = evaluateInjuryAssessment(visual, flags);
    onChange(assessment);
    navigator.vibrate?.(assessment.priority === "kritis" ? [60, 40, 90] : 45);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setVisual(null);
    setFlags(emptyInjuryFlags);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className={`injury-scanner ${open ? "open" : ""}`}>
      <button type="button" className="injury-scanner-toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span><Camera /><strong>Scan Luka Korban</strong><small>Opsional · foto tetap di perangkat</small></span>
        {value ? <em className={value.priority}><Check /> {value.priority === "kritis" ? "KRITIS" : value.priority === "tinggi" ? "TINGGI" : "TERCATAT"}</em> : <em>{open ? "Tutup" : "Buka"}</em>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="injury-scanner-body"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          >
            <div className="injury-privacy"><ShieldCheck /><span><strong>Pemeriksaan visual lokal</strong>Foto tidak diunggah atau disimpan dalam SOS. Bukan diagnosis medis; warna foto tidak menaikkan prioritas tanpa konfirmasi manusia.</span></div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => void selectPhoto(event.target.files?.[0])}
              hidden
            />

            {!preview ? (
              <button type="button" className="injury-photo-picker" onClick={() => inputRef.current?.click()} disabled={analyzing}>
                {analyzing ? <ScanLine className="scan-moving" /> : <ImagePlus />}
                <span><strong>{analyzing ? "Memeriksa foto…" : "Ambil atau pilih foto luka"}</strong><small>Pastikan aman, terang, dan tidak menunda pertolongan.</small></span>
              </button>
            ) : (
              <div className="injury-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Pratinjau foto luka yang dipilih" />
                <button type="button" onClick={clear} aria-label="Hapus foto luka"><X /></button>
                <span className={visual?.quality === "cukup" ? "good" : "retake"}>
                  {visual?.quality === "cukup" ? "Foto cukup jelas" : "Foto kurang jelas · ambil ulang bila aman"}
                </span>
              </div>
            )}

            {error && <p className="injury-error" role="alert">{error}</p>}

            {visual && (
              <>
                <fieldset className="injury-checklist">
                  <legend>Konfirmasi tanda bahaya yang terlihat</legend>
                  {checklist.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={flags[item.key] ? "selected" : ""}
                      onClick={() => toggleFlag(item.key)}
                      aria-pressed={flags[item.key]}
                    >
                      <span>{flags[item.key] ? <Check /> : null}</span>
                      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    </button>
                  ))}
                </fieldset>
                <button type="button" className="injury-assess-action" onClick={assess}>
                  <ScanLine /> Susun triase aman
                </button>
              </>
            )}

            {value && (
              <motion.div className={`injury-result ${value.priority}`} initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                <AlertTriangle />
                <div>
                  <small>TRIASE BERBASIS ATURAN</small>
                  <strong>{value.priority === "kritis" ? "Prioritas kritis" : value.priority === "tinggi" ? "Prioritas tinggi" : "Perlu dipantau"}</strong>
                  <p>{value.guidance[0]}</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
