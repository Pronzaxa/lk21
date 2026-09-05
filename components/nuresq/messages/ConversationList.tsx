"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, MessageSquareText, Sparkles } from "lucide-react";
import type { EmergencyMessage } from "@/lib/nuresq/message-types";
import { MESSAGE_DELIVERY_COPY } from "@/lib/nuresq/message-types";

function timeCopy(value: string) {
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function SystemEventMessage({ message }: { message: EmergencyMessage }) {
  return <div className="system-event-message" role="status"><span />{message.text}<span /></div>;
}

function AIMessageBlock({ message }: { message: EmergencyMessage }) {
  return (
    <article className="conversation-ai-block" aria-label="Insight dari Asisten nuRESQ">
      <header><Sparkles aria-hidden="true" /><strong>ASISTEN nuRESQ</strong></header>
      <p>{message.text}</p>
      <small>Analisis sistem, bukan pesan responder.</small>
    </article>
  );
}

function MessageBubble({ message, onDeliveryDetail }: { message: EmergencyMessage; onDeliveryDetail: (message: EmergencyMessage) => void }) {
  if (message.senderType === "SYSTEM_MESSAGE" || message.senderType === "DELIVERY_EVENT") return <SystemEventMessage message={message} />;
  if (message.senderType === "AI_INSIGHT") return <AIMessageBlock message={message} />;

  const user = message.senderType === "USER_MESSAGE";
  const verifiedResponder = message.senderType === "RESPONDER_MESSAGE" && Boolean(message.responderReceiptId);
  const sender = user ? "ANDA" : verifiedResponder ? "RESPONDER" : "SUMBER TIDAK TERVERIFIKASI";
  return (
    <article className={`message-bubble-row ${user ? "user" : "responder"} ${verifiedResponder ? "verified" : "unverified"}`}>
      <div className="message-bubble">
        <header>
          <strong>{sender}</strong>
          {message.simulation && <span>SIMULASI</span>}
          {!user && !verifiedResponder && <AlertTriangle aria-hidden="true" />}
        </header>
        <p>{message.text}</p>
        <footer>
          <time dateTime={message.createdAt}>{timeCopy(message.createdAt)}</time>
          {user ? (
            <button type="button" onClick={() => onDeliveryDetail(message)} aria-label={`Buka detail pengiriman: ${MESSAGE_DELIVERY_COPY[message.deliveryState]}`}>
              {MESSAGE_DELIVERY_COPY[message.deliveryState]}
            </button>
          ) : verifiedResponder ? <span>Pesan responder terverifikasi</span> : <span>Jangan anggap sebagai arahan responder</span>}
        </footer>
      </div>
    </article>
  );
}

export function ConversationList({
  messages,
  loading,
  onDeliveryDetail,
  onQuickCondition,
  onQuickCompact,
}: {
  messages: EmergencyMessage[];
  loading: boolean;
  onDeliveryDetail: (message: EmergencyMessage) => void;
  onQuickCondition: () => void;
  onQuickCompact: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages.length, reduceMotion]);

  if (loading) {
    return <div className="message-conversation loading" aria-label="Memuat pesan"><i /><i /><i /></div>;
  }

  if (!messages.length) {
    return (
      <div className="message-conversation empty">
        <MessageSquareText aria-hidden="true" />
        <strong>Belum ada percakapan.</strong>
        <p>Jika keadaan berubah, kirim pembaruan kondisi di sini. Pesan tetap dapat disimpan saat offline.</p>
        <div>
          <button type="button" onClick={onQuickCondition}>Kirim kondisi terbaru</button>
          <button type="button" onClick={onQuickCompact}>Buat pesan singkat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-conversation" aria-live="polite" aria-label="Percakapan insiden">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            layout="position"
            initial={reduceMotion ? false : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
          >
            <MessageBubble message={message} onDeliveryDetail={onDeliveryDetail} />
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}
