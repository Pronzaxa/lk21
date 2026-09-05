"use client";

import {
  ArrowLeftRight,
  FilePenLine,
  Info,
  ListChecks,
  MessageCircleQuestion,
  Minimize2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import type { EmergencyMessage } from "@/lib/nuresq/message-types";
import { MESSAGE_DELIVERY_COPY } from "@/lib/nuresq/message-types";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function SheetDismiss() {
  return <SheetClose asChild><button type="button" className="message-sheet-dismiss" aria-label="Tutup"><X aria-hidden="true" /></button></SheetClose>;
}

export type AssistAction = "summary" | "update" | "changes" | "compact" | "explain";

export interface AssistResult {
  title: string;
  body: string;
  source: string;
  usableText: string | null;
}

const ASSIST_OPTIONS = [
  { id: "summary" as const, label: "Ringkas kondisi saya", detail: "Dari laporan dan pesan Anda", Icon: ListChecks },
  { id: "update" as const, label: "Buat pembaruan SOS", detail: "Tinjau fakta sebelum memperbarui", Icon: FilePenLine },
  { id: "changes" as const, label: "Cek perubahan kondisi", detail: "Bandingkan laporan awal dan pesan", Icon: ArrowLeftRight },
  { id: "compact" as const, label: "Buat pesan singkat", detail: "Untuk jaringan terbatas", Icon: Minimize2 },
  { id: "explain" as const, label: "Jelaskan pesan responder", detail: "Sederhanakan tanpa mengubah arti", Icon: MessageCircleQuestion },
];

export function AIAssistSheet({
  open,
  onOpenChange,
  localModelAvailable,
  cloudCoordinatorAvailable,
  responderAvailable,
  result,
  onAction,
  onUseResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localModelAvailable: boolean;
  cloudCoordinatorAvailable: boolean;
  responderAvailable: boolean;
  result: AssistResult | null;
  onAction: (action: AssistAction) => void;
  onUseResult: (text: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="message-sheet ai-assist-sheet" showCloseButton={false}>
        <SheetDismiss />
        <SheetHeader>
          <div className="message-sheet-kicker"><Sparkles aria-hidden="true" /> ASISTEN nuRESQ</div>
          <SheetTitle>Asisten kontekstual</SheetTitle>
          <SheetDescription>
            {localModelAvailable ? "Bantuan lokal lanjutan tersedia." : "Panduan dan analisis dasar tersedia di perangkat."}
            {cloudCoordinatorAvailable ? " Fitur online tersedia." : " Fitur online belum tersedia."}
          </SheetDescription>
        </SheetHeader>
        <div className="assist-option-list">
          {ASSIST_OPTIONS.map(({ id, label, detail, Icon }) => {
            const disabled = id === "explain" && !responderAvailable;
            return (
              <button type="button" key={id} onClick={() => onAction(id)} disabled={disabled}>
                <span><Icon aria-hidden="true" /></span>
                <div><strong>{label}</strong><small>{disabled ? "Belum ada pesan responder" : detail}</small></div>
              </button>
            );
          })}
        </div>
        {result && (
          <section className="assist-result" aria-live="polite">
            <span>HASIL LOKAL</span>
            <h3>{result.title}</h3>
            <p>{result.body}</p>
            <small>{result.source}</small>
            {result.usableText && <button type="button" onClick={() => onUseResult(result.usableText!)}>Gunakan di pesan</button>}
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function DeliveryDetailSheet({
  message,
  onOpenChange,
}: {
  message: EmergencyMessage | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={Boolean(message)} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="message-sheet delivery-detail-sheet" showCloseButton={false}>
        <SheetDismiss />
        <SheetHeader>
          <div className="message-sheet-kicker"><Info aria-hidden="true" /> STATUS PESAN</div>
          <SheetTitle>Detail pengiriman</SheetTitle>
          <SheetDescription>Status hanya berubah ketika perangkat menerima bukti dari jalur pengiriman.</SheetDescription>
        </SheetHeader>
        {message && (
          <div className="delivery-timeline">
            {message.deliveryEvents.map((item, index) => (
              <div key={`${item.state}-${item.at}-${index}`}>
                <span aria-hidden="true" />
                <p><strong>{MESSAGE_DELIVERY_COPY[item.state]}</strong><small>{new Date(item.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small><em>{item.detail}</em></p>
              </div>
            ))}
            <details>
              <summary>Detail jalur</summary>
              <dl><div><dt>Transport</dt><dd>{message.transport === "NODE_RELAY" ? "Relay lokal" : message.transport === "DIRECT_INTERNET" ? "Internet langsung" : "Antrean perangkat"}</dd></div><div><dt>ID pesan</dt><dd>{message.id}</dd></div></dl>
            </details>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AttachmentInfoSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="message-sheet attachment-info-sheet" showCloseButton={false}>
        <SheetDismiss />
        <SheetHeader>
          <div className="message-sheet-kicker"><Paperclip aria-hidden="true" /> LAMPIRAN</div>
          <SheetTitle>Utamakan pesan teks</SheetTitle>
          <SheetDescription>Media belum diaktifkan pada jalur portable ini dan mungkin tidak dapat dikirim melalui jaringan terbatas.</SheetDescription>
        </SheetHeader>
        <div className="attachment-safe-note"><Info aria-hidden="true" /><p><strong>Gunakan teks atau versi ringkas.</strong><span>Informasi kondisi inti akan disimpan di perangkat dan lebih ringan untuk diteruskan.</span></p></div>
        <button type="button" className="sheet-primary-button" onClick={() => onOpenChange(false)}>Kembali menulis</button>
      </SheetContent>
    </Sheet>
  );
}

export function IncidentUpdateDialog({
  message,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: {
  message: EmergencyMessage | null;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const facts = message?.structuredUpdate?.facts ?? [];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="incident-update-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Perbarui kondisi insiden?</AlertDialogTitle>
          <AlertDialogDescription>Fakta berikut akan diproses oleh aturan keselamatan di perangkat. Asisten tidak menentukan prioritas sendiri.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="incident-update-facts">
          {facts.map((item) => <div key={`${item.code}-${item.value}`}><span>{item.label}</span><strong>{item.value}</strong>{item.previousValue && <small>Sebelumnya: {item.previousValue}</small>}</div>)}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={saving || !facts.length} onClick={onConfirm}>{saving ? "Menyimpan…" : "Perbarui"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
