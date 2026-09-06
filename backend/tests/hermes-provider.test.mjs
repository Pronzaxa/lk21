import test from 'node:test';
import assert from 'node:assert/strict';
import { HermesCoordinatorProvider } from '../agent/providers.mjs';

const input = { incident_id: '11111111-1111-4111-8111-111111111111', priority: 'KRITIS', priority_locked: true, location: null };
const env = { HERMES_ENDPOINT: 'https://hermes.test/v1/chat/completions', HERMES_API_KEY: 'test-key', HERMES_MODEL: 'hermes-test' };

test('Hermes adapter performs real bounded tool calls and saves the structured plan', async () => {
  const responses = [
    { choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'getIncidentContext', arguments: JSON.stringify({ incident_id: input.incident_id }) } }] } }] },
    { choices: [{ message: { content: null, tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'saveRescuePlan', arguments: JSON.stringify({ incident_id: input.incident_id, priority: 'KRITIS', recommended_destination: null, recommended_route: null, actions: ['STAY_PUT'], reasons: ['No verified route data'], warnings: ['DATA_UNAVAILABLE'], evidence: [], status: 'ACTIVE' }) } }] } }] },
  ];
  const fetcher = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'hermes-test');
    assert.ok(payload.tools.some(tool => tool.function.name === 'saveRescuePlan'));
    return { ok: true, json: async () => responses.shift() };
  };
  const calls = [];
  const tools = {
    maxCalls: 12,
    async invoke(name, args) {
      calls.push(name);
      if (name === 'getIncidentContext') return input;
      if (name === 'saveRescuePlan') return { ...args, plan_id: '22222222-2222-4222-8222-222222222222', version: 1 };
      throw new Error('unexpected tool');
    },
  };
  const provider = new HermesCoordinatorProvider(env, fetcher);
  const result = await provider.processIncident(input, tools, new AbortController().signal);
  assert.deepEqual(calls, ['getIncidentContext', 'saveRescuePlan']);
  assert.equal(result.priority, 'KRITIS');
});

test('Hermes adapter rejects unstructured output that bypasses tools', async () => {
  const provider = new HermesCoordinatorProvider(env, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Just trust me', tool_calls: [] } }] }) }));
  await assert.rejects(() => provider.processIncident(input, { maxCalls: 2 }, new AbortController().signal), /DID_NOT_USE_TOOLS/);
});

test('Hermes adapter reports missing configuration honestly', async () => {
  const provider = new HermesCoordinatorProvider({ HERMES_MODEL: 'x' });
  assert.equal(provider.ready, false);
  await assert.rejects(() => provider.processIncident(input, {}, new AbortController().signal), /HERMES_NOT_CONFIGURED/);
});
