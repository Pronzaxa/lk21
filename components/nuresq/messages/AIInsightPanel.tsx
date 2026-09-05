"use client";

import { Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { EmergencyMessage } from "@/lib/nuresq/message-types";

export function AIInsightPanel({
  message,
  localModelAvailable,
  onReview,
  onDismiss,
}: {
  message: EmergencyMessage;
  localModelAvailable: boolean;
  onReview: (message: EmergencyMessage) => void;
  onDismiss: (message: EmergencyMessage) => void;
}) {
  const reduceMotion = useReducedMotion();
  const update = message.structuredUpdate;
  if (!update || update.status === "CONFIRMED" || update.dismissedAt) return null;

  return (
    <motion.aside
      className="ai-insight-panel"
      aria-label="Analisis lokal Asisten nuRESQ"
      initial={reduceMotion ? false : { opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <div className="ai-insight-mark"><Sparkles aria-hidden="true" /></div>
      <div className="ai-insight-content">
        <header><span>ASISTEN nuRESQ</span><small>{localModelAvailable ? "Bantuan lokal" : "Analisis lokal"}</small></header>
        <strong>Perubahan kondisi terdeteksi</strong>
        <ul>{update.facts.slice(0, 3).map((item) => <li key={`${item.code}-${item.value}`}><span>{item.label}</span><b>{item.value}</b></li>)}</ul>
        <button type="button" onClick={() => onReview(message)}>Perbarui Kondisi SOS</button>
      </div>
      <button type="button" className="ai-insight-dismiss" onClick={() => onDismiss(message)} aria-label="Tutup insight ini"><X aria-hidden="true" /></button>
    </motion.aside>
  );
}
