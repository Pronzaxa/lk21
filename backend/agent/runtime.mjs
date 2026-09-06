import { randomUUID } from 'node:crypto';
import { CoordinatorTools, DestinationService, HazardService, IncidentContextService, RescuePlanService, RouteRiskService, RouteService, installAgentSchema } from './services.mjs';
import { createCoordinatorProvider } from './providers.mjs';
import { publicErrorCode, safeSummary, TRIGGER_TYPES } from './schema.mjs';

const now = () => new Date().toISOString();

export function createRescueCoordinatorRuntime({ db, mapData, env = process.env, provider = null, fetcher = fetch, logging = true }) {
  installAgentSchema(db);
  const configuredProvider = String(env.AGENT_PROVIDER ?? 'local').toLowerCase() === 'hermes' ? 'hermes' : 'local';
  const enabled = env.AGENT_ENABLED === 'true';
  const coordinator = provider ?? createCoordinatorProvider(env, fetcher);
  const maxCalls = Math.max(1, Math.min(30, Number(env.AGENT_MAX_TOOL_CALLS ?? 12)));
  const timeoutMs = Math.max(1000, Number(env.AGENT_TIMEOUT_SECONDS ?? 30) * 1000);
  const maxAttempts = Math.max(1, Math.min(5, Number(env.AGENT_MAX_ATTEMPTS ?? 3)));
  const retryMs = Math.max(1000, Number(env.AGENT_RETRY_SECONDS ?? 10) * 1000);
  const services = {
    incidentContext: new IncidentContextService(db),
    hazards: new HazardService(mapData),
    routes: new RouteService(env, fetcher),
    routeRisk: new RouteRiskService(),
    destinations: new DestinationService(mapData),
    rescuePlans: new RescuePlanService(db),
  };
  db.prepare("UPDATE agent_jobs SET status='RETRYING', next_attempt_at=?, last_error='PROCESS_RESTARTED' WHERE status='RUNNING'").run(now());
  let running = false;
  let closed = false;
  let timer = null;

  function trace(job, event, toolName = null, summary = null) {
    const sequence = Number(db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM agent_trace WHERE job_id=?').get(job.job_id).next);
    db.prepare('INSERT INTO agent_trace VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), job.job_id, job.incident_id, sequence, event, toolName, JSON.stringify(safeSummary(summary) ?? {}), now());
    if (logging) console.info(`[AGENT] ${event}${toolName ? ` ${toolName}` : ''}`, JSON.stringify(safeSummary(summary) ?? {}));
  }

  function enqueue(incidentId, triggerType, triggerRef = '') {
    if (!enabled || !TRIGGER_TYPES.has(triggerType)) return null;
    const id = randomUUID();
    db.prepare("INSERT OR IGNORE INTO agent_jobs (job_id,incident_id,trigger_type,trigger_ref,status,provider,attempt_count,created_at,next_attempt_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, incidentId, triggerType, String(triggerRef ?? ''), 'PENDING', coordinator.label ?? configuredProvider.toUpperCase(), 0, now(), now());
    return db.prepare('SELECT * FROM agent_jobs WHERE incident_id=? AND trigger_type=? AND trigger_ref=?').get(incidentId, triggerType, String(triggerRef ?? '')) ?? null;
  }

  function schedule(delay = 0) {
    if (closed || !enabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void kick(); }, delay);
    timer.unref?.();
  }

  async function processJob(job) {
    const started = now();
    db.prepare("UPDATE agent_jobs SET status='RUNNING', attempt_count=attempt_count+1, started_at=?, completed_at=NULL, last_error=NULL WHERE job_id=?").run(started, job.job_id);
    const currentJob = db.prepare('SELECT * FROM agent_jobs WHERE job_id=?').get(job.job_id);
    trace(currentJob, 'AGENT_STARTED', null, { status: 'RUNNING', incident_id: job.incident_id, provider: coordinator.label });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const input = services.incidentContext.getIncidentContext({ incident_id: job.incident_id });
      const tools = new CoordinatorTools({ ...services, trace: (event, name, summary) => trace(currentJob, event, name, summary), maxCalls, signal: controller.signal });
      const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('AGENT_TIMEOUT'), { code: 'AGENT_TIMEOUT' })), { once: true }));
      const plan = await Promise.race([coordinator.processIncident(input, tools, controller.signal), aborted]);
      if (controller.signal.aborted) throw Object.assign(new Error('AGENT_TIMEOUT'), { code: 'AGENT_TIMEOUT' });
      db.prepare("UPDATE agent_jobs SET status='COMPLETED', completed_at=?, next_attempt_at=NULL WHERE job_id=?").run(now(), job.job_id);
      trace(currentJob, 'AGENT_COMPLETE', null, { status: 'COMPLETED', plan_id: plan.plan_id, version: plan.version, tool_calls: tools.calls, duration_ms: Date.now() - Date.parse(started) });
    } catch (error) {
      const code = publicErrorCode(error);
      const attempt = currentJob.attempt_count;
      const retry = attempt < maxAttempts;
      const next = retry ? new Date(Date.now() + retryMs * attempt).toISOString() : null;
      db.prepare('UPDATE agent_jobs SET status=?, completed_at=?, next_attempt_at=?, last_error=? WHERE job_id=?').run(retry ? 'RETRYING' : 'FAILED', retry ? null : now(), next, code, job.job_id);
      trace(currentJob, retry ? 'AGENT_RETRYING' : 'AGENT_FAILED', null, { status: retry ? 'RETRYING' : 'FAILED', error: code, attempt });
      if (retry) schedule(retryMs * attempt);
    } finally { clearTimeout(timeout); }
  }

  async function kick() {
    if (running || closed || !enabled || !coordinator.ready) return;
    running = true;
    try {
      while (!closed) {
        const job = db.prepare("SELECT * FROM agent_jobs WHERE status IN ('PENDING','RETRYING') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT 1").get(now());
        if (!job) break;
        await processJob(job);
      }
      const future = db.prepare("SELECT next_attempt_at FROM agent_jobs WHERE status='RETRYING' AND next_attempt_at IS NOT NULL ORDER BY next_attempt_at LIMIT 1").get();
      if (future) schedule(Math.max(100, Date.parse(future.next_attempt_at) - Date.now()));
    } finally { running = false; }
  }

  function latestStatus(incidentId) {
    const job = db.prepare('SELECT job_id,trigger_type,status,provider,attempt_count,created_at,started_at,completed_at,last_error FROM agent_jobs WHERE incident_id=? ORDER BY created_at DESC LIMIT 1').get(incidentId) ?? null;
    return { agent: job, rescue_plan: services.rescuePlans.latest(incidentId) };
  }

  const status = !enabled ? 'DISABLED' : coordinator.ready ? 'READY' : 'MISCONFIGURED';
  if (enabled && coordinator.ready) schedule(0);
  return {
    enabled, provider: configuredProvider, status, coordinator, services, enqueue, kick, latestStatus,
    traceFor: incidentId => db.prepare('SELECT sequence,event_type,tool_name,summary_json,created_at FROM agent_trace WHERE incident_id=? ORDER BY created_at,sequence').all(incidentId).map(row => ({ ...row, summary: JSON.parse(row.summary_json), summary_json: undefined })),
    close() { closed = true; if (timer) clearTimeout(timer); },
    capabilities: { agent: { enabled, provider: configuredProvider, status, model: configuredProvider === 'hermes' ? String(env.HERMES_MODEL ?? '') || null : null }, hazards: true, routing: services.routes.enabled, route_risk: true, destinations: true, weather: false },
  };
}
