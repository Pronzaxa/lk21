"use client";

import { CloudOff, Radio, Wifi } from "lucide-react";
import type { NetworkMode } from "@/lib/nuresq/types";

const labels: Record<NetworkMode, string> = {
  online: "Terhubung",
  terbatas: "Jaringan terbatas",
  offline: "Offline",
};

export function StatusPill({ mode }: { mode: NetworkMode }) {
  const Icon = mode === "online" ? Wifi : mode === "terbatas" ? Radio : CloudOff;
  return (
    <span className={`status-pill ${mode}`}>
      <Icon aria-hidden="true" />
      {labels[mode]}
    </span>
  );
}
