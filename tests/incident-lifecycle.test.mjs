import 'fake-indexeddb/auto';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ configFile: false, root, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { EmergencyRepository: repo } = await vite.ssrLoadModule('/lib/nuresq/emergency-repository.ts');
const sample = (id) => ({ incident_id: id, incident_lifecycle: 'ACTIVE', description: 'Banjir', timestamp: new Date().toISOString(), delivery_status: 'LOCAL_SAVED', acknowledgement: null });
test('resolve/cancel retain history, survive reload reads and exclude delivery', async () => {
  for (const lifecycle of ['RESOLVED', 'CANCELLED']) {
    const item = sample(lifecycle);
    await repo.saveIncident(item);
    assert.equal((await repo.getActiveIncident()).incident_id, item.incident_id);
    await repo.closeIncident(item.incident_id, lifecycle);
    assert.equal(await repo.getActiveIncident(), null);
    const saved = (await repo.getIncidentHistory()).find(x => x.incident_id === item.incident_id);
    assert.equal(saved.incident_lifecycle, lifecycle);
    assert.ok(saved.closed_at);
    assert.equal(await repo.canSendIncident(item.incident_id),false);
    assert.ok((await repo.getOutbox()).some(x=>x.incidentId===item.incident_id),'closed outbox retained for audit, not sent');
    assert.ok(!(await repo.getPendingIncidents()).some(x => x.incident_id === item.incident_id));
    await repo.closeIncident(item.incident_id, lifecycle);
    assert.equal((await repo.getIncidentHistory()).find(x => x.incident_id === item.incident_id).closed_at, saved.closed_at);
  }
});
test('closing older incident cannot clear newer active pointer', async () => {
  await repo.saveIncident(sample('old'));
  await repo.saveIncident(sample('new'));
  await repo.closeIncident('old', 'CANCELLED');
  assert.equal((await repo.getActiveIncident()).incident_id, 'new');
  await assert.rejects(repo.closeIncident('missing', 'RESOLVED'));
  assert.equal((await repo.getActiveIncident()).incident_id, 'new');
});
