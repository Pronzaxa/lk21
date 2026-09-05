"use client";

import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CloudSun,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { LiveHazardFeed } from "@/lib/nuresq/types";
import { freshnessCopy } from "@/lib/nuresq/freshness";

interface LiveRiskPanelProps {
  feed: LiveHazardFeed | null;
  state: "loading" | "fresh" | "cached" | "error";
  onRefresh: () => void;
  onOpenMap: () => void;
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes) || minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function distanceCopy(value?: number) {
  if (!Number.isFinite(value)) return null;
  if ((value ?? 0) < 1) return `${Math.max(10, Math.round((value ?? 0) * 1000))} m`;
  return `${(value ?? 0).toFixed((value ?? 0) < 10 ? 1 : 0).replace(".", ",")} km`;
}

export function LiveRiskPanel({ feed, state, onRefresh, onOpenMap }: LiveRiskPanelProps) {
  const reduceMotion = useReducedMotion();
  const statusCopy = state === "loading"
    ? "MEMERIKSA"
    : state === "cached"
      ? "DATA TERSIMPAN"
      : state === "error"
        ? "TIDAK TERSEDIA"
        : feed?.status === "partial"
          ? "TERSEDIA · SEBAGIAN"
          : feed?.freshness === "AGING"
            ? "DATA MENUA"
            : "DIPERBARUI";
  const alerts = feed?.alerts.slice(0, 3) ?? [];
  const availableSources = feed?.sources.filter((source) => source.state === "available").length ?? 0;

  return (
    <article className="live-risk-panel" aria-labelledby="live-risk-title">
      <header>
        <div>
          <span className="eyebrow">INTEL RISIKO</span>
          <h3 id="live-risk-title">Sinyal sebelum & saat bencana</h3>
        </div>
        <div className="live-risk-actions">
          <span className={`feed-state ${state}`}>
            {state === "error" ? <WifiOff /> : state === "cached" ? <Activity /> : <i />}
            {statusCopy}
          </span>
          <motion.button
            type="button"
            onClick={onRefresh}
            aria-label="Perbarui intel risiko"
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            disabled={state === "loading"}
          >
            <RefreshCw className={state === "loading" ? "spin" : ""} />
          </motion.button>
        </div>
      </header>

      {state === "loading" && !feed ? (
        <div className="risk-skeleton" aria-label="Memuat data risiko">
          <i /><i />
        </div>
      ) : alerts.length ? (
        <div className="live-risk-list">
          {alerts.map((alert, index) => {
            const Icon = alert.kind === "weather" ? CloudSun : alert.severity === "advisory" ? ShieldCheck : AlertTriangle;
            return (
              <motion.button
                type="button"
                key={alert.id}
                className={alert.severity}
                onClick={onOpenMap}
                initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : index * 0.035 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              >
                <span className="risk-signal-icon"><Icon /></span>
                <span className="risk-signal-copy">
                  <strong>{alert.title}</strong>
                  <small>{alert.detail}</small>
                  <em>{alert.sourceName} · {freshnessCopy(alert.freshness, alert.retrievedAt)}{distanceCopy(alert.distanceKm) ? ` · ${distanceCopy(alert.distanceKm)}` : ""}</em>
                </span>
                <ChevronRight />
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="risk-empty">
          <ShieldCheck />
          <div><strong>Belum ada sinyal aktif</strong><span>Sumber tidak memberi peringatan yang dapat ditampilkan saat ini.</span></div>
        </div>
      )}

      <footer>
        <span>{availableSources}/{feed?.sources.length ?? 3} sumber tersedia</span>
        <span>{feed?.locationLabel ?? "Wilayah belum dipilih"} · {state === "cached" ? "periksa usia data" : "sumber diberi label"}</span>
      </footer>
    </article>
  );
}
