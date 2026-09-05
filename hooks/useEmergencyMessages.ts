"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConnectivityState, EmergencyIncident } from "@/lib/nuresq/types";
import type { EmergencyMessage } from "@/lib/nuresq/message-types";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import { applyConfirmedIncidentUpdate, createUserMessage } from "@/lib/nuresq/message-service";
import { getRuntimeMessagingCapabilities, MessageTransportManager } from "@/lib/nuresq/message-transport";
import { analyzeLocally } from '@/lib/nuresq/ai/EmergencyPipeline';

function replaceMessage(messages: EmergencyMessage[], replacement: EmergencyMessage) {
  const index = messages.findIndex((message) => message.id === replacement.id);
  if (index === -1) return [...messages, replacement].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const next = [...messages];
  next[index] = replacement;
  return next;
}

export function useEmergencyMessages(incident: EmergencyIncident | null, connectivity: ConnectivityState) {
  const [messages, setMessages] = useState<EmergencyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const capabilities = useMemo(() => getRuntimeMessagingCapabilities(), [connectivity]);
  const transport = useMemo(() => new MessageTransportManager(EmergencyRepository, capabilities), [capabilities]);
  const capabilityState = transport.capabilityState;
  const updateVisibleMessage = useCallback((message: EmergencyMessage) => {
    setMessages((current) => replaceMessage(current, message));
  }, []);

  const refresh = useCallback(async () => {
    if (!incident) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const saved = await EmergencyRepository.getMessages(incident.incident_id);
      setMessages(saved);
      setStorageError(null);
    } catch {
      setStorageError("Riwayat pesan belum dapat dibuka dari perangkat.");
    } finally {
      setLoading(false);
    }
  }, [incident]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const reload=()=>{if(incident)void EmergencyRepository.getMessages(incident.incident_id).then(setMessages).catch(()=>undefined);};
    window.addEventListener('nuresq-repository-change',reload);
    return () => {window.clearTimeout(timer);window.removeEventListener('nuresq-repository-change',reload);};
  }, [refresh]);

  useEffect(() => {
    if (!incident || (!capabilityState.backendAvailable && !capabilityState.relayAvailable)) return;
    void transport.retryPending(connectivity, incident.incident_id, updateVisibleMessage).catch(() => {
      // Antrean tetap tersimpan. Kegagalan transport bukan kegagalan penyimpanan lokal.
    });
  }, [capabilityState.backendAvailable, capabilityState.relayAvailable, connectivity, incident, transport, updateVisibleMessage]);

  const sendText = useCallback(async (text: string) => {
    if (!incident) throw new Error("Laporan SOS diperlukan sebelum mengirim pesan insiden");
    await analyzeLocally(text,incident.type);
    const message = createUserMessage({ incident, text });
    try {
      const delivered = await transport.send(message, connectivity, updateVisibleMessage);
      setStorageError(null);
      return delivered;
    } catch {
      setStorageError("Pesan belum dapat disimpan.");
      throw new Error("Pesan belum dapat disimpan");
    }
  }, [connectivity, incident, transport, updateVisibleMessage]);

  const dismissInsight = useCallback(async (message: EmergencyMessage) => {
    if (!message.structuredUpdate) return;
    const updated: EmergencyMessage = {
      ...message,
      structuredUpdate: { ...message.structuredUpdate, dismissedAt: new Date().toISOString() },
    };
    await EmergencyRepository.saveMessage(updated);
    updateVisibleMessage(updated);
  }, [updateVisibleMessage]);

  const confirmIncidentUpdate = useCallback(async (message: EmergencyMessage) => {
    if (!incident) throw new Error("Insiden aktif tidak ditemukan");
    const updated = applyConfirmedIncidentUpdate(message, incident);
    await EmergencyRepository.saveIncidentAndMessage(updated.incident, updated.message);
    updateVisibleMessage(updated.message);
    return updated;
  }, [incident, updateVisibleMessage]);

  return {
    messages,
    loading,
    storageError,
    capabilityState,
    sendText,
    dismissInsight,
    confirmIncidentUpdate,
    refresh,
  };
}
