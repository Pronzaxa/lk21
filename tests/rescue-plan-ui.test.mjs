import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');

test('RescuePlan is integrated surgically into existing Assistant and Map state', () => {
  const assistant = read('components/nuresq/assistant/AssistantHubPage.tsx');
  const app = read('components/nuresq/NuResqApp.tsx');
  const client = read('lib/nuresq/backend/BackendClient.ts');
  const css = read('styles/nuresq-assistant.css');
  assert.match(client, /getRescuePlan\(incidentId:string\)/);
  assert.match(assistant, /RENCANA EVAKUASI/);
  assert.match(assistant, /ACK laporan tetap sudah tersimpan/);
  assert.match(assistant, /recommended_route/);
  assert.match(assistant, /Lihat di Peta/);
  assert.match(app, /coordinatorRoute/);
  assert.match(app, /plannedRoute\.geometry\.coordinates/);
  assert.match(app, /useNavigationRoute\(/);
  assert.match(css, /assistant-rescue-plan/);
  assert.match(css, /@media \(max-width:600px\)/);
});
