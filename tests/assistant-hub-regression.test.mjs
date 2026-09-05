import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

const app = read('components/nuresq/NuResqApp.tsx');
const assistant = read('components/nuresq/assistant/AssistantHubPage.tsx');
const messages = read('components/nuresq/messages/MessagesPage.tsx');
const composer = read('components/nuresq/messages/SmartMessageComposer.tsx');
const account = read('components/nuresq/AccountView.tsx');
const responsive = read('styles/nuresq-responsive.css');
const guides = read('lib/nuresq/field-guides.ts');

assert.match(app, /id:\s*"pesan",\s*label:\s*"Pesan",\s*icon:\s*MessageSquareText/);
assert.match(app, /pesan:\s*"Pesan & Asisten"/);
assert.doesNotMatch(app, /reportState\s*!==\s*"idle"[\s\S]{0,180}setView\("pesan"\)/);
assert.match(app, /aria-label=\{isSos && reportActive \? "SOS, terdapat insiden aktif" : item\.label\}/);
assert.match(app, /<small>\{item\.label\}<\/small>/);
assert.match(app, /function ActiveIncidentSheet/);
assert.match(app, /onAssistant=\{\(\) => openAssistant\("assistant"\)\}/);

assert.match(assistant, /NO_ACTIVE_INCIDENT|Asisten nuRESQ|Panduan Darurat/);
assert.match(assistant, /parseEmergencyDescription/);
assert.match(assistant, /detectSafetySignals/);
assert.match(assistant, /useState<"assistant" \| "responder">\("assistant"\)/);
assert.match(assistant, /<MessagesPage/);
assert.doesNotMatch(assistant, /import[^\n]*EmergencyMessage/);
assert.match(assistant, /Buat Laporan SOS/);
assert.match(assistant, /Tetap di Asisten/);

assert.match(messages, /incidentOverride\?: EmergencyIncident \| null/);
assert.match(messages, /embedded\?: boolean/);
assert.match(messages, /draftSeed\?: MessageDraftSeed/);
assert.match(composer, /Tulis pesan untuk responder…/);
assert.doesNotMatch(composer, /onAttach/);

assert.match(account, /Riwayat Laporan/);
assert.match(account, /EmergencyRepository\.getIncidentHistory\(\)/);
assert.match(responsive, /button\.incident-active \.sos-center-disc::after/);
assert.match(guides, /Asisten → Responder/);

console.log('assistant-hub-regression: 20+ static acceptance checks passed');
