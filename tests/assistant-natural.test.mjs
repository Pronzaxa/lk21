import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/nuresq/assistant-emergency.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { emergencyResponse } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

for (const [input, hazard] of [
  ['Saya melihat banjir dan air terus naik', 'banjir'],
  ['Tolong air masuk rumah, kami berdua di sini', 'banjir'],
  ['Lantai bergetar sekarang saya takut', 'gempa'],
  ['Rumah bergoyang, saya masih di kamar', 'gempa'],
  ['Asap tebal di lorong dan api membesar', 'kebakaran'],
  ['Tanah bergerak di belakang rumah', 'longsor'],
  ['Ibu nggak bisa napas, tolong!', 'medis'],
  ['Ayah pingsan sekarang', 'medis'],
  ['Tidak ada banjir, tapi api menyebar', 'kebakaran'],
]) test(input, () => {
  const result = emergencyResponse(input);
  assert.ok(result.hazards.includes(hazard));
  assert.equal(result.recommendSos, true);
  assert.ok(result.text.includes('belum terkonfirmasi'));
});

for (const input of ['Apa itu banjir?', 'Latihan gempa untuk tugas sekolah', 'Banjir kemarin sudah surut']) {
  test(`informational: ${input}`, () => assert.equal(emergencyResponse(input).recommendSos, false));
}
for (const input of ['Tidak ada banjir', 'Bukan kebakaran', 'Tanpa gempa', 'Halo asisten']) {
  test(`no hazard: ${input}`, () => assert.equal(emergencyResponse(input), null));
}
test('multiple hazards retain both guidance paths', () => {
  assert.deepEqual(emergencyResponse('Banjir dan ibu pingsan sekarang').hazards, ['banjir', 'medis']);
});
