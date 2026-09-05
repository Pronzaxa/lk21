"use client";

import { AlertTriangle, Check } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motionDuration, tactileSpring } from "@/lib/nuresq/motion";

interface SOSButtonProps {
  onComplete: () => void;
  compact?: boolean;
}

const HOLD_DURATION_SECONDS = 1.9;
const RING_CIRCUMFERENCE = 553;

export function SOSButton({ onComplete, compact = false }: SOSButtonProps) {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const ringOffset = useTransform(progress, [0, 1], [RING_CIRCUMFERENCE, 0]);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const completeTimer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => () => {
    animation.current?.stop();
    if (completeTimer.current) window.clearTimeout(completeTimer.current);
  }, []);

  const finishHold = useCallback(() => {
    setHolding(false);
    setComplete(true);
    navigator.vibrate?.([100, 45, 120]);
    completeTimer.current = window.setTimeout(() => {
      onComplete();
      setComplete(false);
      progress.set(0);
    }, reduceMotion ? 0 : 180);
  }, [onComplete, progress, reduceMotion]);

  const start = useCallback(() => {
    if (holding || complete) return;
    animation.current?.stop();
    progress.set(0);
    setHolding(true);
    animation.current = animate(progress, 1, {
      duration: reduceMotion ? 0.01 : HOLD_DURATION_SECONDS,
      ease: "linear",
      onComplete: finishHold,
    });
  }, [complete, finishHold, holding, progress, reduceMotion]);

  const cancel = useCallback(() => {
    if (!holding || complete) return;
    animation.current?.stop();
    setHolding(false);
    animation.current = animate(progress, 0, {
      duration: reduceMotion ? 0.01 : motionDuration.normal,
      ease: [0.4, 0, 1, 1],
    });
  }, [complete, holding, progress, reduceMotion]);

  return (
    <motion.button
      type="button"
      className={`sos-button ${holding ? "is-holding" : ""} ${complete ? "is-complete" : ""} ${compact ? "compact" : ""}`}
      animate={{ scale: complete ? 1.045 : holding ? 0.965 : 1 }}
      transition={reduceMotion ? { duration: 0 } : tactileSpring}
      whileHover={holding || complete || reduceMotion ? undefined : { scale: 1.018 }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") cancel();
      }}
      aria-label="Tekan dan tahan selama 1,9 detik untuk memulai laporan SOS"
      aria-describedby="sos-hold-hint"
    >
      <motion.span
        className="sos-ambient-ring"
        aria-hidden="true"
        animate={{ opacity: holding ? 0.75 : 0.28, scale: holding ? 1.08 : 1 }}
        transition={{ duration: reduceMotion ? 0 : motionDuration.normal }}
      />
      <svg className="sos-progress-ring" viewBox="0 0 192 192" aria-hidden="true">
        <circle className="sos-progress-track" cx="96" cy="96" r="88" />
        <motion.circle
          className="sos-progress-value"
          cx="96"
          cy="96"
          r="88"
          strokeDasharray={RING_CIRCUMFERENCE}
          style={{ strokeDashoffset: ringOffset }}
        />
      </svg>
      <span className="sos-core">
        {complete ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
        <strong>{complete ? "SIAP" : "SOS"}</strong>
        {!compact && <small>{complete ? "MEMBUKA LAPORAN" : holding ? "TERUS TAHAN" : "TEKAN & TAHAN"}</small>}
      </span>
      {!compact && <span className="sos-hold-time" id="sos-hold-hint">1,9 detik</span>}
    </motion.button>
  );
}
