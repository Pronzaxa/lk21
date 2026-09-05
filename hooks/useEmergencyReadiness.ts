"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { EmergencyRepository, inspectStorageReadiness } from "@/lib/nuresq/emergency-repository";
import type { LiveHazardFeed, LocationSnapshot } from "@/lib/nuresq/types";
import { localAI, prepareLocalAI } from '@/lib/nuresq/ai/LocalAIManager';

interface ReadinessState {
  appOffline: boolean;
  guidesOffline: boolean;
  hasTrustedLocation: boolean;
  cachedMapTiles: number;
  riskDataReady: boolean;
  contacts: number;
  storageSupported: boolean;
  storagePersisted: boolean;
  storageUsage: number | null;
  storageQuota: number | null;
}

const initial: ReadinessState = {
  appOffline: false,
  guidesOffline: true,
  hasTrustedLocation: false,
  cachedMapTiles: 0,
  riskDataReady: false,
  contacts: 0,
  storageSupported: false,
  storagePersisted: false,
  storageUsage: null,
  storageQuota: null,
};

export function useEmergencyReadiness(location: LocationSnapshot | null, hazardFeed: LiveHazardFeed | null) {
  const [state, setState] = useState(initial);
  const localAIState=useSyncExternalStore(localAI.subscribe,localAI.getState,()=> 'UNAVAILABLE');

  const refresh = useCallback(async (requestPersistence = false) => {
    const [storage, contacts, registration, tileCount] = await Promise.all([
      inspectStorageReadiness(requestPersistence).catch(() => initial),
      EmergencyRepository.getContacts().catch(() => []),
      "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined,
      "caches" in window
        ? caches.open("nuresq-tiles-v3").then((cache) => cache.keys()).then((keys) => keys.length).catch(() => 0)
        : 0,
    ]);
    setState({
      appOffline: Boolean(registration?.active),
      guidesOffline: true,
      hasTrustedLocation: Boolean(location),
      cachedMapTiles: tileCount,
      riskDataReady: hazardFeed?.freshness === "FRESH" || hazardFeed?.freshness === "AGING",
      contacts: contacts.length,
      storageSupported: "supported" in storage ? Boolean(storage.supported) : false,
      storagePersisted: "persisted" in storage ? Boolean(storage.persisted) : false,
      storageUsage: "usage" in storage && typeof storage.usage === "number" ? storage.usage : null,
      storageQuota: "quota" in storage && typeof storage.quota === "number" ? storage.quota : null,
    });
  }, [hazardFeed?.freshness, location]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const score = useMemo(() => {
    let value = 0;
    if (state.appOffline) value += 20;
    if (state.guidesOffline) value += 20;
    if (state.hasTrustedLocation) value += 20;
    if (state.cachedMapTiles > 0) value += 20;
    if (state.riskDataReady) value += 10;
    if (state.contacts > 0) value += 10;
    return value;
  }, [state]);

  return { state, score, refresh, localAIState, prepareLocalAI };
}
