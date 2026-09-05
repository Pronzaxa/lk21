"use client";

import { Compass, Layers3, LocateFixed, Maximize2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { NavigationCameraMode, NavigationState } from "@/lib/nuresq/types";

export function NavigationMapControls({
  detailed,
  state,
  cameraMode,
  compassVisible,
  onToggleLayers,
  onNorthUp,
  onOverview,
  onRecenter,
}: {
  detailed: boolean;
  state: NavigationState;
  cameraMode: NavigationCameraMode;
  compassVisible: boolean;
  onToggleLayers: () => void;
  onNorthUp: () => void;
  onOverview: () => void;
  onRecenter: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const tap = reduceMotion ? undefined : { scale: 0.94 };
  const recenterProminent = cameraMode === "EXPLORE" || state === "FREE_PAN" || state === "FREE_ZOOM" || cameraMode === "OVERVIEW";
  return (
    <div className="navigation-map-controls" aria-label="Kontrol navigasi peta">
      <motion.button type="button" whileTap={tap} onClick={onNorthUp} className={compassVisible ? "visible" : "subdued"} aria-label="Arahkan peta ke utara"><Compass /></motion.button>
      <motion.button type="button" whileTap={tap} onClick={onToggleLayers} className={detailed ? "active" : ""} aria-label="Ubah detail peta" aria-pressed={detailed}><Layers3 /></motion.button>
      <motion.button type="button" whileTap={tap} onClick={onOverview} className={cameraMode === "OVERVIEW" ? "active" : ""} aria-label="Lihat keseluruhan perjalanan" aria-pressed={cameraMode === "OVERVIEW"}><Maximize2 /></motion.button>
      <motion.button type="button" whileTap={tap} onClick={onRecenter} className={`recenter ${recenterProminent ? "prominent" : ""}`} aria-label="Kembali mengikuti lokasi"><LocateFixed /></motion.button>
    </div>
  );
}
