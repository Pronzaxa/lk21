"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { AudioLines, Mic, Send, Sparkles } from "lucide-react";
import type { NetworkMode } from "@/lib/nuresq/types";

export function SmartMessageComposer({
  value,
  networkMode,
  relayAvailable,
  listening,
  sending,
  onChange,
  onSend,
  onAssist,
  onVoice,
}: {
  value: string;
  networkMode: NetworkMode;
  relayAvailable: boolean;
  listening: boolean;
  sending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onAssist: () => void;
  onVoice: () => void;
}) {
  const lowBandwidth = networkMode !== "online" || relayAvailable;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && !sending) onSend();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (value.trim() && !sending) onSend();
    }
  };

  return (
    <form className="smart-message-composer" onSubmit={submit}>
      {lowBandwidth && <div className="composer-network-note"><span />{relayAvailable ? "Jalur relay tersedia · mode data minimum" : "Mode data minimum · pesan akan disimpan lebih dulu"}</div>}
      <div className="composer-controls">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          rows={1}
          maxLength={1_200}
          placeholder="Tulis pesan untuk responder…"
          aria-label="Tulis pesan untuk responder"
        />
        <button type="button" className="composer-assist" onClick={onAssist} aria-label="Buka Asisten nuRESQ"><Sparkles aria-hidden="true" /></button>
        <button type="button" className={`composer-utility ${listening ? "listening" : ""}`} onClick={onVoice} aria-label={listening ? "Hentikan input suara" : "Mulai input suara"}>
          {listening ? <AudioLines aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </button>
        <button type="submit" className="composer-send" disabled={!value.trim() || sending} aria-label={sending ? "Menyimpan pesan" : "Kirim atau simpan pesan"}><Send aria-hidden="true" /></button>
      </div>
      <span className="composer-privacy">Analisis kondisi dilakukan setelah pesan dikirim atau saat Anda meminta bantuan.</span>
    </form>
  );
}
