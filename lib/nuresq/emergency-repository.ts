import type { EmergencyContact, EmergencyIncident } from "./types";
import type { EmergencyMessage } from "./message-types";
import { isEmergencyMessage, messageNeedsDelivery } from "./message-types";
import type { RawLocationFix } from "./location";
import { hasVerifiedAcknowledgement } from "./delivery";
import { resolveIncidentLifecycle } from "./incident-state";
import type { OutboxItem } from './backend/QueueManager';
import type { ServerAck } from './backend/BackendClient';
import { calculateRisk, parseEmergencyDescription } from './safety';

const DATABASE_NAME = "nuresq-emergency-core";
const DATABASE_VERSION = 3;
const OUTBOX_STORE = 'hybrid-outbox';
export const notifyRepository = () => { if(typeof window!=='undefined') window.dispatchEvent(new Event('nuresq-repository-change')); };
const INCIDENT_STORE = "incidents";
const MESSAGE_STORE = "messages";
const METADATA_STORE = "metadata";
const TRUSTED_LOCATION_KEY = "last-trusted-location";
const MIGRATION_KEY = "legacy-localstorage-migrated";
const CONTACTS_KEY = "emergency-contacts";
const ACTIVE_INCIDENT_KEY = "active-incident-id";

interface MetadataRecord<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operasi IndexedDB gagal"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Transaksi IndexedDB gagal"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaksi IndexedDB dibatalkan"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(INCIDENT_STORE)) {
        const incidents = database.createObjectStore(INCIDENT_STORE, { keyPath: "incident_id" });
        incidents.createIndex("delivery_status", "delivery_status", { unique: false });
        incidents.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
        const messages = database.createObjectStore(MESSAGE_STORE, { keyPath: "id" });
        messages.createIndex("incidentId", "incidentId", { unique: false });
        messages.createIndex("createdAt", "createdAt", { unique: false });
        messages.createIndex("deliveryState", "deliveryState", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Database darurat gagal dibuka"));
    request.onblocked = () => reject(new Error("Database darurat sedang dipakai versi lama"));
  });
  return databasePromise;
}

async function putRecord(storeName: string, value: unknown) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionComplete(transaction);
}

async function getMetadata<T>(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(METADATA_STORE, "readonly");
  const result = await requestResult(transaction.objectStore(METADATA_STORE).get(key));
  await transactionComplete(transaction);
  return (result as MetadataRecord<T> | undefined)?.value ?? null;
}

async function setMetadata<T>(key: string, value: T) {
  await putRecord(METADATA_STORE, { key, value, updatedAt: new Date().toISOString() } satisfies MetadataRecord<T>);
}

function legacyIncident(value: unknown): EmergencyIncident | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.incident_id !== "string" || typeof item.timestamp !== "string") return null;
  const latitude = typeof item.latitude === "number" && Number.isFinite(item.latitude) ? item.latitude : null;
  const longitude = typeof item.longitude === "number" && Number.isFinite(item.longitude) ? item.longitude : null;
  return {
    incident_id: item.incident_id,
    type: typeof item.type === "string" ? item.type as EmergencyIncident["type"] : null,
    description: typeof item.description === "string" ? item.description : "",
    latitude,
    longitude,
    location_trust: latitude !== null && longitude !== null ? "LAST_TRUSTED" : "UNAVAILABLE",
    location_accuracy_m: typeof item.location_accuracy_m === "number" ? item.location_accuracy_m : null,
    location_updated_at: null,
    victim_count: typeof item.victim_count === "number" ? item.victim_count : null,
    mobility: item.mobility === "terbatas" ? "terbatas" : "normal",
    risk_level: typeof item.risk_level === "string" ? item.risk_level : "BELUM DINILAI",
    requested_help: typeof item.requested_help === "string" ? item.requested_help : "bantuan darurat",
    injury_triage: null,
    timestamp: item.timestamp,
    connectivity_state: item.connectivity_state === "offline" ? "OFFLINE" : "DEGRADED",
    delivery_status: "LOCAL_SAVED",
    delivery_capability: "DELIVERY_NOT_CONFIGURED",
    acknowledgement: null,
    last_delivery_attempt_at: null,
  };
}

async function migrateLegacyLocalStorage() {
  if (typeof localStorage === "undefined") return;
  if (await getMetadata<boolean>(MIGRATION_KEY)) return;
  const candidates: unknown[] = [];
  for (const key of ["nuresq-sos-history", "nuresq-sos-queue"]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(parsed)) candidates.push(...parsed);
    } catch {
      // Corrupt legacy data is left untouched so it is not silently destroyed.
      return;
    }
  }
  for (const candidate of candidates) {
    const incident = legacyIncident(candidate);
    if (incident) await putRecord(INCIDENT_STORE, incident);
  }
  const trustedRaw = localStorage.getItem("nuresq-last-trusted-location");
  if (trustedRaw) {
    try {
      const trusted = JSON.parse(trustedRaw) as Partial<RawLocationFix>;
      if (typeof trusted.latitude === "number" && Number.isFinite(trusted.latitude)
        && typeof trusted.longitude === "number" && Number.isFinite(trusted.longitude)
        && typeof trusted.accuracy === "number" && Number.isFinite(trusted.accuracy)
        && typeof trusted.timestamp === "number" && Number.isFinite(trusted.timestamp)) {
        await setMetadata(TRUSTED_LOCATION_KEY, trusted as RawLocationFix);
      }
    } catch {
      // Invalid legacy location is not promoted to trusted data.
    }
  }
  await setMetadata(MIGRATION_KEY, true);
  localStorage.removeItem("nuresq-sos-history");
  localStorage.removeItem("nuresq-sos-queue");
  localStorage.removeItem("nuresq-last-trusted-location");
}

export const EmergencyRepository = {
  async initialize() {
    await openDatabase();
    await migrateLegacyLocalStorage();
  },

  async saveIncident(incident: EmergencyIncident) {
    await this.initialize();
    const db=await openDatabase();const tx=db.transaction([INCIDENT_STORE,METADATA_STORE,OUTBOX_STORE],'readwrite');const completed=transactionComplete(tx);
    const store=tx.objectStore(INCIDENT_STORE);const request=store.get(incident.incident_id);
    request.onsuccess=()=>{
      const existing=request.result as EmergencyIncident|undefined;
      if(existing&&resolveIncidentLifecycle(existing)!=='ACTIVE'){tx.abort();return;}
      store.put(existing?.acknowledgement?{...incident,acknowledgement:existing.acknowledgement,delivery_status:existing.delivery_status}:incident);
      if(resolveIncidentLifecycle(incident)==='ACTIVE')tx.objectStore(METADATA_STORE).put({key:ACTIVE_INCIDENT_KEY,value:incident.incident_id,updatedAt:new Date().toISOString()});
      if(!existing)tx.objectStore(OUTBOX_STORE).put({id:incident.incident_id,kind:'incident',incidentId:incident.incident_id,createdAt:incident.timestamp,attempts:0,nextAttemptAt:0,payload:{...incident,schema_version:1,incident_lifecycle:incident.incident_lifecycle??'ACTIVE',locked_priority:incident.risk_level}} satisfies OutboxItem);
    };
    await completed;
    notifyRepository();
    return incident;
  },

  async getActiveIncident() {
    await this.initialize();
    const activeId = await getMetadata<string>(ACTIVE_INCIDENT_KEY);
    if (!activeId) return null;
    const database = await openDatabase();
    const transaction = database.transaction(INCIDENT_STORE, "readonly");
    const record = await requestResult(transaction.objectStore(INCIDENT_STORE).get(activeId)) as EmergencyIncident | undefined;
    await transactionComplete(transaction);
    if (!record) {
      await setMetadata(ACTIVE_INCIDENT_KEY, null);
      return null;
    }
    if (resolveIncidentLifecycle(record) !== "ACTIVE") {
      await setMetadata(ACTIVE_INCIDENT_KEY, null);
      return null;
    }
    return record;
  },

  async setActiveIncident(incidentId: string | null) {
    await this.initialize();
    await setMetadata(ACTIVE_INCIDENT_KEY, incidentId);
  },

  async clearActiveIncident(incidentId?: string) {
    await this.initialize();
    const current = await getMetadata<string>(ACTIVE_INCIDENT_KEY);
    if (!incidentId || current === incidentId) await setMetadata(ACTIVE_INCIDENT_KEY, null);
  },

  async getIncidentHistory() {
    await this.initialize();
    const database = await openDatabase();
    const transaction = database.transaction(INCIDENT_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(INCIDENT_STORE).getAll()) as EmergencyIncident[];
    await transactionComplete(transaction);
    return records.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  },

  async closeIncident(incidentId: string, lifecycle: "RESOLVED" | "CANCELLED") {
    await this.initialize();
    const database = await openDatabase();
    const transaction = database.transaction([INCIDENT_STORE, METADATA_STORE], "readwrite");
    const completed = transactionComplete(transaction);
    const incidents = transaction.objectStore(INCIDENT_STORE);
    const metadata = transaction.objectStore(METADATA_STORE);
    let closed: EmergencyIncident | null = null;
    const request = incidents.get(incidentId);
    request.onsuccess = () => {
      const incident = request.result as EmergencyIncident | undefined;
      if (!incident) { transaction.abort(); return; }
      closed = resolveIncidentLifecycle(incident) === "ACTIVE"
        ? { ...incident, incident_lifecycle: lifecycle, closed_at: new Date().toISOString() }
        : incident;
      incidents.put(closed);
      const pointer = metadata.get(ACTIVE_INCIDENT_KEY);
      pointer.onsuccess = () => {
        if (pointer.result?.value === incidentId) metadata.delete(ACTIVE_INCIDENT_KEY);
      };
    };
    await completed;
    return closed;
  },

  async getPendingIncidents() {
    const incidents = await this.getIncidentHistory();
    return incidents.filter((incident) => resolveIncidentLifecycle(incident) === "ACTIVE" && !hasVerifiedAcknowledgement(incident));
  },

  async saveMessage(message: EmergencyMessage) {
    await this.initialize();
    if (!isEmergencyMessage(message)) throw new Error("Format pesan darurat tidak valid");
    const db=await openDatabase();const tx=db.transaction([MESSAGE_STORE,OUTBOX_STORE],'readwrite');const completed=transactionComplete(tx);
    const messageStore=tx.objectStore(MESSAGE_STORE);const previous=messageStore.get(message.id);
    previous.onsuccess=()=>{const saved=previous.result as EmergencyMessage|undefined;messageStore.put(saved?.acknowledgementId&&!message.acknowledgementId?{...message,deliveryState:saved.deliveryState,transport:saved.transport,acknowledgementId:saved.acknowledgementId,deliveryEvents:saved.deliveryEvents}:message);};
    if(message.senderType==='USER_MESSAGE'&&message.deliveryState==='LOCAL_SAVED') {
      const request=tx.objectStore(OUTBOX_STORE).get(message.id);
      request.onsuccess=()=>{if(!request.result)tx.objectStore(OUTBOX_STORE).put({id:message.id,kind:'update',incidentId:message.incidentId,messageId:message.id,createdAt:message.createdAt,attempts:0,nextAttemptAt:0,payload:{schema_version:1,update_id:message.id,incident_id:message.incidentId,created_at:message.createdAt,raw_text:message.text,facts:{suggestion:message.structuredUpdate},locked_priority:calculateRisk({type:null,description:message.text,...parseEmergencyDescription(message.text),injuryAssessment:null}).level}} satisfies OutboxItem);};
    }
    await completed;
    notifyRepository();
    return message;
  },

  async saveIncidentAndMessage(incident: EmergencyIncident, message: EmergencyMessage) {
    await this.initialize();
    if (!isEmergencyMessage(message)) throw new Error("Format pesan darurat tidak valid");
    const database = await openDatabase();
    const transaction = database.transaction([INCIDENT_STORE, MESSAGE_STORE, OUTBOX_STORE], "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(INCIDENT_STORE);
    const existing = store.get(incident.incident_id);
    existing.onsuccess = () => {
      if (!existing.result || resolveIncidentLifecycle(existing.result) !== "ACTIVE") {
        transaction.abort();
        return;
      }
      store.put({...incident,acknowledgement:existing.result.acknowledgement,delivery_status:existing.result.delivery_status});
      transaction.objectStore(MESSAGE_STORE).put(message);
      const id=crypto.randomUUID();
      transaction.objectStore(OUTBOX_STORE).put({id,kind:'update',incidentId:incident.incident_id,createdAt:message.structuredUpdate?.confirmedAt??message.createdAt,attempts:0,nextAttemptAt:0,payload:{schema_version:1,update_id:id,incident_id:incident.incident_id,created_at:message.structuredUpdate?.confirmedAt??message.createdAt,raw_text:message.text,facts:{confirmed:message.structuredUpdate},locked_priority:incident.risk_level}} satisfies OutboxItem);
    };
    await completed;
    notifyRepository();
    return { incident, message };
  },

  async getMessage(messageId: string) {
    await this.initialize();
    const database = await openDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const record = await requestResult(transaction.objectStore(MESSAGE_STORE).get(messageId));
    await transactionComplete(transaction);
    return isEmergencyMessage(record) ? record : null;
  },

  async getMessages(incidentId: string) {
    await this.initialize();
    const database = await openDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(MESSAGE_STORE).index("incidentId").getAll(incidentId),
    ) as unknown[];
    await transactionComplete(transaction);
    return records
      .filter(isEmergencyMessage)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  },

  async getPendingMessages(incidentId?: string) {
    await this.initialize();
    const activeIds = new Set((await this.getIncidentHistory()).filter((incident) => resolveIncidentLifecycle(incident) === "ACTIVE").map((incident) => incident.incident_id));
    const database = await openDatabase();
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(MESSAGE_STORE).getAll()) as unknown[];
    await transactionComplete(transaction);
    return records
      .filter(isEmergencyMessage)
      .filter((message) => activeIds.has(message.incidentId) && (!incidentId || message.incidentId === incidentId) && messageNeedsDelivery(message))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  },

  async markDelivered(incidentId: string, acknowledgement: { id: string; acknowledgedAt: string }) {
    if (!acknowledgement.id.trim() || !Number.isFinite(Date.parse(acknowledgement.acknowledgedAt))) {
      throw new Error("ACK nyata diperlukan sebelum laporan dapat ditandai diterima");
    }
    const database = await openDatabase();
    const transaction = database.transaction(INCIDENT_STORE, "readwrite");
    const store = transaction.objectStore(INCIDENT_STORE);
    const incident = await requestResult(store.get(incidentId)) as EmergencyIncident | undefined;
    if (!incident) throw new Error("Laporan tidak ditemukan");
    store.put({ ...incident, delivery_status: "ACKNOWLEDGED", acknowledgement });
    await transactionComplete(transaction);
  },

  async getDeviceToken() {
    await this.initialize();const db=await openDatabase();const tx=db.transaction(METADATA_STORE,'readwrite');const complete=transactionComplete(tx);const store=tx.objectStore(METADATA_STORE);
    let token='';const request=store.get('hybrid-device-token');request.onsuccess=()=>{token=request.result?.value??Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');store.put({key:'hybrid-device-token',value:token,updatedAt:new Date().toISOString()});};await complete;return token;
  },
  async canSendIncident(id:string) {const incident=(await this.getIncidentHistory()).find(item=>item.incident_id===id);return Boolean(incident&&resolveIncidentLifecycle(incident)==='ACTIVE');},
  async getOutbox():Promise<OutboxItem[]> {await this.initialize();const db=await openDatabase();return await requestResult(db.transaction(OUTBOX_STORE,'readonly').objectStore(OUTBOX_STORE).getAll()) as OutboxItem[];},
  async saveOutbox(item:OutboxItem){await putRecord(OUTBOX_STORE,item);},
  async ackOutbox(item:OutboxItem,ack:ServerAck){
    const db=await openDatabase();const tx=db.transaction([OUTBOX_STORE,INCIDENT_STORE,MESSAGE_STORE],'readwrite');const completed=transactionComplete(tx);
    tx.objectStore(OUTBOX_STORE).put({...item,ack,error:undefined});
    if(item.kind==='incident'){
      const store=tx.objectStore(INCIDENT_STORE);const req=store.get(item.incidentId);req.onsuccess=()=>{if(req.result&&!req.result.acknowledgement)store.put({...req.result,delivery_status:'ACKNOWLEDGED',acknowledgement:{id:ack.ack_id,acknowledgedAt:ack.received_at}});};
    }else if(item.messageId){
      const store=tx.objectStore(MESSAGE_STORE);const req=store.get(item.messageId);req.onsuccess=()=>{if(req.result)store.put({...req.result,deliveryState:'SERVER_ACKNOWLEDGED',transport:'DIRECT_INTERNET',acknowledgementId:ack.ack_id,deliveryEvents:[...req.result.deliveryEvents,{state:'SERVER_ACKNOWLEDGED',at:ack.received_at,detail:'Pembaruan diterima sistem',acknowledgementId:ack.ack_id}]});};
    }
    await completed;notifyRepository();
  },

  async saveTrustedLocation(fix: RawLocationFix) {
    await this.initialize();
    await setMetadata(TRUSTED_LOCATION_KEY, fix);
  },

  async getTrustedLocation() {
    await this.initialize();
    return getMetadata<RawLocationFix>(TRUSTED_LOCATION_KEY);
  },

  async saveContacts(contacts: EmergencyContact[]) {
    await this.initialize();
    await setMetadata(CONTACTS_KEY, contacts);
  },

  async getContacts() {
    await this.initialize();
    const saved = await getMetadata<EmergencyContact[]>(CONTACTS_KEY);
    if (saved) return saved;
    if (typeof localStorage === "undefined") return [];
    try {
      const legacy = JSON.parse(localStorage.getItem("nuresq-emergency-contacts") ?? "[]") as unknown;
      if (!Array.isArray(legacy)) return [];
      const contacts = legacy.filter((item): item is EmergencyContact => Boolean(item)
        && typeof item === "object"
        && typeof (item as EmergencyContact).id === "string"
        && typeof (item as EmergencyContact).name === "string"
        && typeof (item as EmergencyContact).phone === "string");
      await setMetadata(CONTACTS_KEY, contacts);
      localStorage.removeItem("nuresq-emergency-contacts");
      return contacts;
    } catch {
      return [];
    }
  },
};

export async function inspectStorageReadiness(requestPersistence = false) {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return { supported: false, persisted: false, usage: null, quota: null };
  }
  let persisted = await navigator.storage.persisted?.() ?? false;
  if (requestPersistence && !persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
  const estimate = await navigator.storage.estimate?.();
  return {
    supported: true,
    persisted,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}
