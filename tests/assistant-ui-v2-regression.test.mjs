import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('components/nuresq/NuResqApp.tsx');
const assistant = read('components/nuresq/assistant/AssistantHubPage.tsx');
const messages = read('components/nuresq/messages/MessagesPage.tsx');
const repo = read('lib/nuresq/emergency-repository.ts');
const state = read('lib/nuresq/incident-state.ts');
const sos = read('components/nuresq/SosFlow.tsx');
const css = read('styles/nuresq-assistant.css');

const checks = [
  ['bottom navigation exposes Pesan with the correct icon', () => assert.match(app, /id:\s*"pesan",\s*label:\s*"Pesan",\s*icon:\s*MessageSquareText/)],
  ['SOS nav label remains SOS', () => assert.match(app, /id:\s*"sos",\s*label:\s*"SOS"/)],
  ['app resolves active incident explicitly', () => assert.match(app, /EmergencyRepository\.getActiveIncident\(\)/)],
  ['app no longer derives active incident from history', () => assert.doesNotMatch(app, /getIncidentHistory\(\).*items\.at\(-1\)/s)],
  ['home uses SOS AKTIF as lifecycle status', () => assert.match(app, /SOS AKTIF/)],
  ['home no longer promotes stored state as lifecycle headline', () => assert.doesNotMatch(app, /LAPORAN SOS TERSIMPAN|SOS TERSIMPAN OFFLINE/)],
  ['assistant resolves active incident explicitly', () => assert.match(assistant, /EmergencyRepository\.getActiveIncident\(\)/)],
  ['assistant does not infer active from latest history', () => assert.doesNotMatch(assistant, /getIncidentHistory\(|items\.at\(-1\)/)],
  ['responder page resolves active incident explicitly', () => assert.match(messages, /EmergencyRepository\.getActiveIncident\(\)/)],
  ['assistant shows human-readable condition section', () => assert.match(assistant, /KONDISI ANDA/)],
  ['assistant does not use PESAN INSIDEN as condition', () => assert.doesNotMatch(assistant, /PESAN INSIDEN/)],
  ['incident id is rendered as secondary metadata', () => assert.match(assistant, /<small>\{incident\.incident_id\}<\/small>/)],
  ['condition hides broad unknown-field dumps', () => assert.doesNotMatch(assistant, /Belum diketahui|Tidak dilaporkan|Unknown/)],
  ['condition derives facts from existing incident/parser data', () => assert.match(assistant, /victim_count|parseEmergencyDescription|injury_triage/)],
  ['update condition is the primary active action', () => assert.match(assistant, /assistant-v2-update[^>]*>[\s\S]*Perbarui kondisi/)],
  ['secondary actions are Ringkas Panduan Peta', () => {
    assert.match(assistant, />Ringkas<\/span>/);
    assert.match(assistant, />Panduan<\/span>/);
    assert.match(assistant, />Peta<\/span>/);
  }],
  ['active assistant has question input', () => assert.match(assistant, /Tanyakan tentang kondisi atau langkah selanjutnya/)],
  ['assistant/responders use one shared two-mode switch', () => {
    assert.match(assistant, /role="tab"[\s\S]*Asisten/);
    assert.match(assistant, /role="tab"[\s\S]*Responder/);
  }],
  ['general assistant does not use EmergencyMessage transport type', () => assert.doesNotMatch(assistant, /import type \{[^}]*EmergencyMessage/)],
  ['active incident metadata has a dedicated repository pointer', () => assert.match(repo, /ACTIVE_INCIDENT_KEY\s*=\s*"active-incident-id"/)],
  ['repository exposes getActiveIncident', () => assert.match(repo, /async getActiveIncident\(\)/)],
  ['repository can explicitly clear active incident', () => assert.match(repo, /async clearActiveIncident\(/)],
  ['active resolver does not infer ACTIVE from history order', () => assert.match(state, /never infers ACTIVE from history order/i)],
  ['lifecycle and delivery presentation are separated', () => {
    assert.match(state, /title:\s*"SOS AKTIF"/);
    assert.match(state, /deliveryDetail:/);
  }],
  ['verified acknowledgement is required for received-system copy', () => {
    assert.match(state, /hasVerifiedAcknowledgement\(incident\)/);
    assert.match(state, /Sistem telah menerima laporan/);
  }],
  ['offline state says stored only as secondary detail', () => {
    assert.match(state, /detail:\s*"Menunggu jalur pengiriman\."/);
    assert.match(state, /deliveryDetail:\s*"Tersimpan di perangkat\."/);
  }],
  ['SOS completion screen now retains active lifecycle wording', () => assert.match(sos, /SOS aktif/)],
  ['assistant V2 outer active surface is not a giant nested card', () => assert.match(css, /\.assistant-v2-active\s*\{[^}]*background:\s*transparent/s)],
  ['light theme has first-class light assistant surfaces', () => {
    assert.match(css, /\.light\s+\.assistant-v2-context/);
    assert.match(css, /background:\s*#fff/);
  }],
  ['active typography is not built around 8px critical copy', () => assert.doesNotMatch(css, /assistant-v2-[^{]+\{[^}]*font-size:\s*[89]px/s)],
  ['active mobile width avoids horizontal overflow', () => assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*assistant-v2-/s)],
];

let passed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`\n${passed}/${checks.length} Assistant UI V2 regression checks passed.`);
