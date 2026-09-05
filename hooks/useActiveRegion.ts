"use client";

import { useEffect, useState } from "react";
import type { ActiveRegion } from "@/lib/nuresq/types";

const STORAGE_KEY = "nuresq-active-region";

function validRegion(value: unknown): value is ActiveRegion {
  if (!value || typeof value !== "object") return false;
  const region = value as Record<string, unknown>;
  return typeof region.adm4 === "string"
    && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(region.adm4)
    && typeof region.label === "string"
    && (region.latitude === undefined || typeof region.latitude === "number")
    && (region.longitude === undefined || typeof region.longitude === "number");
}

export function useActiveRegion() {
  const [region, setRegionState] = useState<ActiveRegion | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
        if (validRegion(parsed)) setRegionState(parsed);
      } catch {
        setRegionState(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setRegion = (next: ActiveRegion | null) => {
    setRegionState(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  };
  return { region, setRegion };
}
