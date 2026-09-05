"use client";

import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  MapPin,
  Navigation,
  RotateCcw,
  Route,
  Satellite,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  Destination,
  ManeuverKind,
  NavigationManeuver,
  NavigationProgress,
  NavigationRunMode,
  NavigationState,
  NetworkMode,
  TravelMode,
} from "@/lib/nuresq/types";
import { estimatedArrivalTime, maneuverDistanceCopy } from "@/lib/nuresq/navigation";
import { formatRouteDistance, formatRouteDuration } from "@/lib/nuresq/routing";

function ManeuverGlyph({ kind }: { kind: ManeuverKind }) {
  if (kind === "left" || kind === "sharp-left") return <CornerUpLeft className={kind === "sharp-left" ? "sharp" : ""} />;
  if (kind === "right" || kind === "sharp-right") return <CornerUpRight className={kind === "sharp-right" ? "sharp" : ""} />;
  if (kind === "u-turn") return <RotateCcw />;
  if (kind === "roundabout") return <CircleDot />;
  if (kind === "destination") return <MapPin />;
  return <ArrowUp className={kind} />;
}

export function ManeuverCard({
  state,
  maneuver,
  nextManeuver,
  distanceMeters,
  directionOnly,
}: {
  state: NavigationState;
  maneuver: NavigationManeuver | null;
  nextManeuver: NavigationManeuver | null;
  distanceMeters: number | null;
  directionOnly: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // Operational warnings live in the secondary notice strip so the maneuver remains primary.
  const stateCopy = state === "ARRIVING"
    ? "Hampir sampai"
    : state === "ARRIVED"
      ? "Anda telah tiba di tujuan"
      : null;
  const fallbackInstruction = directionOnly ? "Lanjut menuju tujuan" : "Lanjut mengikuti rute";

  return (
    <motion.section
      className={`maneuver-card state-${state.toLowerCase()} ${directionOnly ? "direction-only" : ""}`}
      aria-live="polite"
      layout
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${state}-${maneuver?.id ?? "fallback"}`}
          className="maneuver-card-content"
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <span className="maneuver-icon" aria-hidden="true">
            {directionOnly ? <Navigation /> : <ManeuverGlyph kind={maneuver?.kind ?? "straight"} />}
          </span>
          <div>
            <strong className="maneuver-distance">
              {stateCopy ?? (distanceMeters === null ? "—" : maneuverDistanceCopy(distanceMeters))}
            </strong>
            <span className="maneuver-primary">{maneuver?.instruction ?? fallbackInstruction}</span>
            {nextManeuver && state !== "REROUTING" && (
              <small>Kemudian: {nextManeuver.instruction}</small>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

export function NavigationNotice({
  networkMode,
  state,
  trackingError,
  runMode,
  locationAgeCopy,
}: {
  networkMode: NetworkMode;
  state: NavigationState;
  trackingError: string | null;
  runMode: NavigationRunMode;
  locationAgeCopy: string | null;
}) {
  const notice = runMode === "DEMO_NAVIGATION"
    ? { icon: Satellite, label: "SIMULASI", detail: "Koordinat simulasi tidak dipakai untuk SOS." }
    : state === "REROUTING"
      ? { icon: Route, label: "Mencari rute baru…", detail: "Posisi tetap dilacak selama perhitungan ulang." }
      : state === "OFF_ROUTE_PENDING"
        ? null
        : state === "GPS_STALE"
          ? { icon: Satellite, label: "Lokasi terakhir", detail: locationAgeCopy ?? "GPS belum diperbarui." }
          : state === "GPS_WEAK" || trackingError
            ? { icon: Satellite, label: "GPS kurang akurat", detail: trackingError ?? "Gerakan peta diredam." }
            : state === "DIRECTION_ONLY"
              ? { icon: Navigation, label: "ARAH TUJUAN", detail: "Rute jalan tidak tersedia; garis hanya menunjukkan arah." }
              : networkMode !== "online" || state === "OFFLINE_ROUTE" || state === "NETWORK_DEGRADED"
                ? { icon: WifiOff, label: "Mode navigasi offline", detail: "Rute yang sudah dimuat tetap digunakan; rute baru mungkin tidak tersedia." }
                : null;
  if (!notice) return null;
  const Icon = notice.icon;
  return (
    <motion.div className="navigation-notice" role="status" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
      <Icon aria-hidden="true" />
      <span><strong>{notice.label}</strong><small>{notice.detail}</small></span>
    </motion.div>
  );
}

export function RouteHazardWarning({ title, freshness, stale }: { title: string; freshness: string; stale: boolean }) {
  return (
    <motion.div className={`route-hazard-warning ${stale ? "stale" : ""}`} role="status" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
      <AlertTriangle aria-hidden="true" />
      <span><strong>{title}</strong><small>{freshness}{stale ? " · Informasi mungkin sudah berubah" : ""}</small></span>
    </motion.div>
  );
}

export function TripProgressPanel({
  destination,
  progress,
  travelMode,
  directionOnly,
  hazardsKnown,
  expanded,
  onToggle,
  endArmed,
  onEnd,
  arrived,
}: {
  destination: Destination;
  progress: NavigationProgress | null;
  travelMode: TravelMode;
  directionOnly: boolean;
  hazardsKnown: boolean;
  expanded: boolean;
  onToggle: () => void;
  endArmed: boolean;
  onEnd: () => void;
  arrived: boolean;
}) {
  const remainingDistance = progress?.remainingDistanceMeters ?? 0;
  const remainingDuration = progress?.remainingDurationSeconds ?? 0;
  const riskLabel = hazardsKnown ? "DATA TERBATAS" : "BELUM DINILAI";
  return (
    <motion.aside className={`trip-progress-panel ${expanded ? "expanded" : "collapsed"} ${arrived ? "arrived" : ""}`} layout>
      <button type="button" className="trip-panel-toggle" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? "Ringkas detail perjalanan" : "Buka detail perjalanan"}>
        <span />{expanded ? <ChevronDown /> : <ChevronUp />}
      </button>
      {arrived ? (
        <div className="arrival-copy"><MapPin /><span><strong>Anda telah tiba di tujuan</strong><small>{destination.name} · status fasilitas belum dikonfirmasi</small></span></div>
      ) : (
        <div className="trip-primary-metrics">
          <span><strong>{progress ? formatRouteDuration(remainingDuration) : "—"}</strong><small>tersisa</small></span>
          <span><strong>{progress ? formatRouteDistance(remainingDistance) : "—"}</strong><small>{directionOnly ? "garis lurus" : "jarak"}</small></span>
          <span><strong>{progress ? estimatedArrivalTime(remainingDuration) : "—"}</strong><small>tiba</small></span>
        </div>
      )}
      <div className="trip-status-row">
        <span className={`route-status-chip ${directionOnly ? "direction" : "limited"}`}>{directionOnly ? "ARAH TUJUAN" : riskLabel}</span>
        <small>{directionOnly ? "Rute jalan tidak tersedia" : "Risiko rute belum dapat dipastikan"}</small>
      </div>
      {expanded && (
        <motion.div className="trip-expanded-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div><Route /><span><strong>{destination.name}</strong><small>{travelMode === "walking" ? "Jalan kaki" : "Kendaraan"} · tujuan belum diverifikasi</small></span></div>
          <p>{directionOnly ? "Garis putus-putus hanya menunjukkan arah ke tujuan, bukan jalan yang dapat dilalui." : "Tetap periksa kondisi jalan, peringatan bahaya, dan arahan petugas."}</p>
        </motion.div>
      )}
      <button type="button" className={`end-navigation-button ${endArmed ? "armed" : ""}`} onClick={onEnd}>
        {arrived ? "Selesai" : endArmed ? "Ketuk lagi untuk mengakhiri" : "Akhiri Navigasi"}
      </button>
    </motion.aside>
  );
}
