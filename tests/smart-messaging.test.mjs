import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

function incident(overrides = {}) {
  return {
    incident_id: "NRQ-A82F",
    type: "Banjir",
    description: "Air setinggi pinggang. Dua korban berada di rumah.",
    latitude: null,
    longitude: null,
    location_trust: "UNAVAILABLE",
    location_accuracy_m: null,
    location_updated_at: null,
    victim_count: 2,
    mobility: "normal",
    risk_level: "PRIORITAS TINGGI",
    requested_help: "evakuasi",
    injury_triage: null,
    timestamp: "2026-09-02T04:50:00.000Z",
    connectivity_state: "OFFLINE",
    delivery_status: "LOCAL_SAVED",
    delivery_capability: "DELIVERY_NOT_CONFIGURED",
    acknowledgement: null,
    last_delivery_attempt_at: null,
    ...overrides,
  };
}

class MemoryMessageStore {
  records = new Map();
  async saveMessage(message) { this.records.set(message.id, structuredClone(message)); return structuredClone(message); }
  async getMessage(id) { return this.records.has(id) ? structuredClone(this.records.get(id)) : null; }
  async getPendingMessages(incidentId) {
    const { messageNeedsDelivery } = await vite.ssrLoadModule("/lib/nuresq/message-types.ts");
    return [...this.records.values()].filter((message) => (!incidentId || message.incidentId === incidentId) && messageNeedsDelivery(message)).map((message) => structuredClone(message));
  }
}

function noCapabilities() {
  return { backend: null, relay: null, localModelAvailable: false, cloudCoordinatorAvailable: false };
}

test("analisis lokal mengekstrak perubahan penting tanpa menganggap AI sebagai penentu prioritas", async () => {
  const { analyzeEmergencyMessage } = await vite.ssrLoadModule("/lib/nuresq/message-analysis.ts");
  const analysis = analyzeEmergencyMessage("Air tambah tinggi, ibu sekarang sesak dan kami pindah ke lantai dua.");
  assert.equal(analysis.meaningful, true);
  assert.deepEqual(new Set(analysis.facts.map((fact) => fact.code)), new Set(["WATER_TREND", "BREATHING", "LOCATION_CONTEXT"]));
  assert.equal(analysis.priority, "URGENT");
  assert.equal(analyzeEmergencyMessage("terima kasih").meaningful, false);
  const negative = analyzeEmergencyMessage("Air tidak naik dan ibu tidak sesak.");
  assert.equal(negative.facts.some((fact) => fact.code === "WATER_TREND" && fact.value === "Meningkat"), false);
  assert.equal(negative.facts.some((fact) => fact.code === "BREATHING" && fact.value === "Kesulitan dilaporkan"), false);
});

test("pesan ringkas mempertahankan fakta dan tidak mengarang data", async () => {
  const { compactEmergencyMessage } = await vite.ssrLoadModule("/lib/nuresq/message-analysis.ts");
  const compact = compactEmergencyMessage("Kami berdua pindah ke lantai dua. Air hampir dada, ibu sesak, baterai tinggal sedikit.");
  assert.match(compact, /Korban: 2 orang/);
  assert.match(compact, /Lokasi: Lantai 2/);
  assert.match(compact, /Ketinggian air: Hampir dada/);
  assert.match(compact, /Pernapasan: Kesulitan dilaporkan/);
  assert.match(compact, /Baterai: Rendah/);
  assert.doesNotMatch(compact, /bantuan pasti|responder|aman/i);
});

test("offline send disimpan dan tetap antre setelah koneksi kembali tanpa transport", async () => {
  const { createUserMessage } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  const { MessageTransportManager } = await vite.ssrLoadModule("/lib/nuresq/message-transport.ts");
  const store = new MemoryMessageStore();
  const manager = new MessageTransportManager(store, noCapabilities());
  const draft = createUserMessage({ incident: incident(), text: "Air sekarang hampir dada.", id: "message-offline", now: new Date("2026-09-02T04:52:00Z") });
  const queued = await manager.send(draft, "OFFLINE");
  assert.equal(queued.id, "message-offline");
  assert.equal(queued.deliveryState, "QUEUED");
  assert.equal(queued.transport, "LOCAL_QUEUE");
  assert.ok((await store.getMessage(draft.id)).deliveryEvents.some((event) => event.state === "LOCAL_SAVED"));
  const retried = await manager.retryPending("CONNECTED", draft.incidentId);
  assert.equal(retried[0].deliveryState, "QUEUED");
  assert.equal((await store.getMessage(draft.id)).deliveryState, "QUEUED");
});

test("HTTP sukses tanpa ACK tidak pernah ditampilkan sebagai diterima sistem", async () => {
  const { createUserMessage } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  const { MessageTransportManager } = await vite.ssrLoadModule("/lib/nuresq/message-transport.ts");
  const store = new MemoryMessageStore();
  const manager = new MessageTransportManager(store, { ...noCapabilities(), backend: { send: async () => null } });
  const result = await manager.send(createUserMessage({ incident: incident(), text: "Kami di lantai dua.", id: "no-ack" }), "CONNECTED");
  assert.equal(result.deliveryState, "QUEUED");
  assert.equal(result.acknowledgementId, null);
});

test("ACK nyata mengontrol status diterima sistem dan retry memakai ID yang sama", async () => {
  const { createUserMessage } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  const { MessageTransportManager } = await vite.ssrLoadModule("/lib/nuresq/message-transport.ts");
  const store = new MemoryMessageStore();
  let calls = 0;
  const manager = new MessageTransportManager(store, {
    ...noCapabilities(),
    backend: { send: async (message) => { calls += 1; assert.equal(message.id, "stable-id"); return { acknowledgementId: "ack-server-19", acknowledgedAt: "2026-09-02T04:53:00.000Z" }; } },
  });
  const draft = createUserMessage({ incident: incident(), text: "Kondisi diperbarui.", id: "stable-id" });
  const acknowledged = await manager.send(draft, "CONNECTED");
  assert.equal(acknowledged.deliveryState, "SERVER_ACKNOWLEDGED");
  assert.equal(acknowledged.acknowledgementId, "ack-server-19");
  const duplicateRetry = await manager.send(draft, "CONNECTED");
  assert.equal(duplicateRetry.deliveryState, "SERVER_ACKNOWLEDGED");
  assert.equal(calls, 1);
});

test("relay hanya mengklaim gateway sampai ACK server benar-benar tersedia", async () => {
  const { createUserMessage } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  const { MessageTransportManager } = await vite.ssrLoadModule("/lib/nuresq/message-transport.ts");
  const store = new MemoryMessageStore();
  const manager = new MessageTransportManager(store, {
    ...noCapabilities(),
    relay: { send: async () => ({ gatewayAcknowledgementId: "gateway-4", receivedAt: "2026-09-02T04:55:00.000Z" }) },
  });
  const result = await manager.send(createUserMessage({ incident: incident(), text: "Butuh evakuasi.", id: "relay-1" }), "OFFLINE");
  assert.equal(result.deliveryState, "GATEWAY_RECEIVED");
  assert.equal(result.transport, "NODE_RELAY");
  assert.notEqual(result.deliveryState, "SERVER_ACKNOWLEDGED");
});

test("pembaruan SOS hanya diterapkan setelah konfirmasi dan tetap memakai Safety Engine existing", async () => {
  const { createUserMessage, applyConfirmedIncidentUpdate } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  const original = incident({ description: "Air setinggi pinggang.", victim_count: null, risk_level: "PRIORITAS SEDANG" });
  const message = createUserMessage({ incident: original, text: "Air tambah tinggi dan ibu mulai sesak. Kami pindah ke lantai dua.", id: "update-1" });
  assert.equal(original.description, "Air setinggi pinggang.");
  assert.equal(message.structuredUpdate.status, "SUGGESTED");
  const updated = applyConfirmedIncidentUpdate(message, original, new Date("2026-09-02T05:00:00Z"));
  assert.match(updated.incident.description, /Pembaruan kondisi:/);
  assert.equal(updated.message.structuredUpdate.status, "CONFIRMED");
  assert.equal(updated.message.structuredUpdate.safetyResult.engineLabel, "Aturan keselamatan di perangkat");
  assert.equal(updated.incident.acknowledgement, null);
  assert.equal(updated.incident.delivery_status, "LOCAL_SAVED");
});

test("pesan responder tidak dapat dibuat tanpa receipt nyata", async () => {
  const { createVerifiedResponderMessage } = await vite.ssrLoadModule("/lib/nuresq/message-service.ts");
  assert.throws(() => createVerifiedResponderMessage({ incidentId: "NRQ-A82F", text: "Tim menuju lokasi.", receiptId: "", receivedAt: "2026-09-02T05:00:00Z", source: "BACKEND" }), /Receipt responder nyata/);
  const verified = createVerifiedResponderMessage({ incidentId: "NRQ-A82F", text: "Tim menuju lokasi.", receiptId: "receipt-1", receivedAt: "2026-09-02T05:00:00Z", source: "BACKEND" });
  assert.equal(verified.senderType, "RESPONDER_MESSAGE");
  assert.equal(verified.responderReceiptId, "receipt-1");
});

test("implementasi tetap surgical dan memakai store IndexedDB yang sama", async () => {
  const [app, assistantHub, repository, css] = await Promise.all([
    readFile(`${root}/components/nuresq/NuResqApp.tsx`, "utf8"),
    readFile(`${root}/components/nuresq/assistant/AssistantHubPage.tsx`, "utf8"),
    readFile(`${root}/lib/nuresq/emergency-repository.ts`, "utf8"),
    readFile(`${root}/styles/nuresq-messages.css`, "utf8"),
  ]);
  assert.match(app, /\{ id: "beranda", label: "Beranda"/);
  assert.match(app, /\{ id: "peta", label: "Peta"/);
  assert.match(app, /\{ id: "sos", label: "SOS"/);
  assert.match(app, /\{ id: "pesan", label: "Pesan"/);
  assert.match(app, /\{ id: "akun", label: "Akun"/);
  assert.match(app, /<AssistantHubPage/);
  assert.match(assistantHub, /<MessagesPage/);
  assert.match(repository, /DATABASE_VERSION = 3/);
  assert.match(repository, /OUTBOX_STORE = 'hybrid-outbox'/);
  assert.match(repository, /MESSAGE_STORE = "messages"/);
  assert.match(repository, /saveIncidentAndMessage/);
  assert.doesNotMatch(repository, /localStorage.*nuresq-message/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(max-width: 360px\)/);
});
