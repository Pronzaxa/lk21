import { randomUUID } from 'node:crypto';
import { boundedRadius, isUuid, safeSummary, validateCoordinate, validateRescuePlan } from './schema.mjs';

const now = () => new Date().toISOString();
const json = value => JSON.stringify(value ?? null);
const parse = value => value ? JSON.parse(value) : null;

function distanceMeters(a, b) {
  const radius = 6_371_000;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function pointSegmentMeters(point, start, end) {
  const latitude = (start[1] + end[1] + point[1]) / 3 * Math.PI / 180;
  const scaleX = 111_320 * Math.cos(latitude);
  const scaleY = 110_540;
  const px = (point[0] - start[0]) * scaleX;
  const py = (point[1] - start[1]) * scaleY;
  const ex = (end[0] - start[0]) * scaleX;
  const ey = (end[1] - start[1]) * scaleY;
  const length = ex * ex + ey * ey;
  const t = length ? Math.max(0, Math.min(1, (px * ex + py * ey) / length)) : 0;
  return Math.hypot(px - t * ex, py - t * ey);
}

function geometryPoints(geometry) {
  if (geometry?.type === 'Point') return [geometry.coordinates];
  if (geometry?.type === 'LineString') return geometry.coordinates ?? [];
  if (geometry?.type === 'Polygon') return geometry.coordinates?.flat() ?? [];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates?.flat(2) ?? [];
  return [];
}

export function installAgentSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_jobs (
      job_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
      trigger_type TEXT NOT NULL,
      trigger_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      next_attempt_at TEXT,
      last_error TEXT,
      UNIQUE(incident_id, trigger_type, trigger_ref)
    );
    CREATE INDEX IF NOT EXISTS agent_jobs_pending_idx ON agent_jobs(status, next_attempt_at, created_at);
    CREATE TABLE IF NOT EXISTS agent_trace (
      trace_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES agent_jobs(job_id),
      incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
      sequence INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(job_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS agent_trace_incident_idx ON agent_trace(incident_id, created_at);
    CREATE TABLE IF NOT EXISTS rescue_plans (
      plan_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
      version INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      destination_json TEXT,
      route_json TEXT,
      actions_json TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      supersedes_plan_id TEXT REFERENCES rescue_plans(plan_id),
      UNIQUE(incident_id, version)
    );
    CREATE INDEX IF NOT EXISTS rescue_plans_incident_idx ON rescue_plans(incident_id, version DESC);
  `);
  db.exec('PRAGMA optimize;');
}

export class IncidentContextService {
  constructor(db) { this.db = db; }
  getIncidentContext({ incident_id }) {
    if (!isUuid(incident_id)) throw Object.assign(new Error('INVALID_INCIDENT_ID'), { code: 'INVALID_INCIDENT_ID' });
    const row = this.db.prepare('SELECT incident_id, incident_type, priority, payload_json, lifecycle_state, created_at, updated_at, received_at FROM incidents WHERE incident_id=?').get(incident_id);
    if (!row) throw Object.assign(new Error('INCIDENT_NOT_FOUND'), { code: 'INCIDENT_NOT_FOUND' });
    const payload = parse(row.payload_json) ?? {};
    const updates = this.db.prepare('SELECT update_id, created_at, payload_json, priority FROM incident_updates WHERE incident_id=? ORDER BY created_at DESC LIMIT 10').all(incident_id).map(item => {
      const update = parse(item.payload_json) ?? {};
      return { update_id: item.update_id, created_at: item.created_at, priority: item.priority, facts: update.facts ?? {} };
    });
    const plan = this.db.prepare('SELECT plan_id, version, status, created_at FROM rescue_plans WHERE incident_id=? ORDER BY version DESC LIMIT 1').get(incident_id) ?? null;
    return {
      incident_id: row.incident_id,
      incident_type: String(row.incident_type ?? 'Lainnya').toUpperCase().replaceAll(' ', '_'),
      priority: row.priority,
      priority_locked: true,
      lifecycle: row.lifecycle_state,
      location: payload.latitude == null || payload.longitude == null ? null : { lat: payload.latitude, lon: payload.longitude, accuracy_m: payload.location_accuracy_m ?? null },
      victims: { count: payload.victim_count ?? null, mobility_limited: payload.mobility === 'terbatas' || payload.mobility_limited === true, vulnerable: payload.mobility === 'terbatas' || payload.mobility_limited === true },
      conditions: {
        breathing: payload.injury_triage?.red_flags?.breathingDifficulty ? 'DIFFICULTY' : 'UNKNOWN',
        consciousness: payload.injury_triage?.red_flags?.unconscious ? 'UNCONSCIOUS' : 'UNKNOWN',
      },
      environment: { water_level_cm: Number.isFinite(payload.water_level_cm) ? payload.water_level_cm : null, water_trend: payload.water_trend ?? 'UNKNOWN' },
      latest_updates: updates,
      current_plan: plan,
      created_at: row.created_at,
      updated_at: row.updated_at,
      received_at: row.received_at,
    };
  }
}

export class HazardService {
  constructor(mapData) { this.mapData = mapData; }
  async getHazards({ lat, lon, radius_m = 15_000 }) {
    validateCoordinate({ lat, lon }, true);
    const radius = boundedRadius(radius_m);
    const url = new URL('http://internal/api/hazards');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('radius', String(radius));
    const result = await this.mapData.getHazards(url);
    return {
      data_state: result?.data_state ?? 'UNAVAILABLE',
      hazards: Array.isArray(result?.hazards) ? result.hazards : [],
      generated_at: result?.generated_at ?? now(),
      last_successful_update: result?.last_successful_update ?? null,
    };
  }
}

export class RouteService {
  constructor(env = process.env, fetcher = fetch) {
    this.fetcher = fetcher;
    this.enabled = env.ROUTING_ENABLED !== 'false' && Boolean(env.OSRM_ENDPOINT ?? 'https://router.project-osrm.org');
    this.endpoint = String(env.OSRM_ENDPOINT ?? 'https://router.project-osrm.org').replace(/\/$/, '');
    this.timeoutMs = Math.max(1000, Number(env.ROUTING_TIMEOUT_SECONDS ?? 8) * 1000);
  }
  async getRouteAlternatives({ origin, destination, travel_mode = 'driving' }, signal) {
    const from = validateCoordinate(origin, true);
    const to = validateCoordinate(destination, true);
    if (!this.enabled) return { data_state: 'UNAVAILABLE', routes: [], error: 'ROUTING_DISABLED' };
    if (travel_mode !== 'driving') return { data_state: 'UNAVAILABLE', routes: [], error: 'TRAVEL_MODE_UNAVAILABLE' };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const url = `${this.endpoint}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=2&overview=full&geometries=geojson&steps=false`;
      const response = await this.fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'nuRESQ-rescue-coordinator/1.0' }, signal: controller.signal });
      if (!response.ok) return { data_state: 'UNAVAILABLE', routes: [], error: `ROUTING_${response.status}` };
      const body = await response.json();
      const routes = Array.isArray(body?.routes) ? body.routes.slice(0, 3).flatMap((route, index) => {
        const coordinates = route?.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates) ? route.geometry.coordinates.slice(0, 10_000) : null;
        if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return [];
        return [{ route_id: `osrm-route-${index}`, geometry: { type: 'LineString', coordinates }, distance_m: route.distance, duration_s: route.duration, provider: 'OSRM', retrieved_at: now() }];
      }) : [];
      return { data_state: routes.length ? 'LIVE' : 'UNAVAILABLE', routes };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { data_state: 'UNAVAILABLE', routes: [], error: error?.name === 'AbortError' ? 'ROUTING_TIMEOUT' : 'ROUTING_UNAVAILABLE' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export class RouteRiskService {
  evaluateRouteRisk({ routes, hazards, travel_mode = 'driving' }) {
    if (!Array.isArray(routes) || routes.length > 10 || !Array.isArray(hazards) || hazards.length > 200) {
      throw Object.assign(new Error('INVALID_ROUTE_RISK_INPUT'), { code: 'INVALID_ROUTE_RISK_INPUT' });
    }
    return routes.map(route => {
      const coordinates = route?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 10_000 || coordinates.some(point => !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) throw Object.assign(new Error('INVALID_ROUTE_GEOMETRY'), { code: 'INVALID_ROUTE_GEOMETRY' });
      let score = 0;
      const reasons = [];
      for (const hazard of hazards) {
        const points = geometryPoints(hazard.geometry).filter(point => Array.isArray(point) && point.length >= 2);
        if (!points.length) continue;
        let nearest = Number.POSITIVE_INFINITY;
        for (const point of points.slice(0, 500)) {
          for (let index = 1; index < coordinates.length; index += 1) nearest = Math.min(nearest, pointSegmentMeters(point, coordinates[index - 1], coordinates[index]));
        }
        const severity = hazard.severity === 'HIGH' ? 24 : hazard.severity === 'MEDIUM' ? 14 : 7;
        const proximity = nearest <= 100 ? 3 : nearest <= 350 ? 2 : nearest <= 850 ? 1 : 0;
        if (!proximity) continue;
        const weight = severity * proximity;
        score += weight;
        reasons.push(`${hazard.type ?? 'HAZARD'} berjarak sekitar ${Math.round(nearest)} m dari rute (${hazard.source ?? 'sumber tidak diketahui'})`);
      }
      if (!reasons.length) reasons.push('Tidak ada perpotongan hazard berkoordinat yang terdeteksi pada radius evaluasi.');
      if (travel_mode !== 'driving') score += 5;
      return { route_id: route.route_id, risk_score: Math.min(100, Math.round(score)), reasons: reasons.slice(0, 10) };
    });
  }
}

export class DestinationService {
  constructor(mapData) { this.mapData = mapData; }
  async getDestinations({ incident_type, location, radius_m = 25_000, required_capabilities = [] }) {
    const point = validateCoordinate(location, true);
    const radius = boundedRadius(radius_m, 25_000);
    const url = new URL('http://internal/api/destinations');
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lon));
    url.searchParams.set('radius', String(radius));
    const result = await this.mapData.getDestinations(url);
    const requested = new Set(Array.isArray(required_capabilities) ? required_capabilities.slice(0, 20) : []);
    const destinations = (Array.isArray(result?.destinations) ? result.destinations : []).map(item => ({ ...item, distance_m: distanceMeters([point.lon, point.lat], [item.location.lon, item.location.lat]), required_capability_matches: [...requested].filter(value => item.capabilities?.includes(value)) }));
    return { data_state: result?.data_state ?? 'UNAVAILABLE', source_status: result?.source_status ?? 'UNKNOWN', incident_type, destinations };
  }
  evaluateDestination({ destination, incident_type, victims = {}, route_risk = null }) {
    if (!destination?.id || !destination.location) throw Object.assign(new Error('INVALID_DESTINATION'), { code: 'INVALID_DESTINATION' });
    let score = 50;
    const reasons = [];
    const warnings = [];
    const medical = incident_type === 'DARURAT_MEDIS' || incident_type === 'MEDICAL';
    const suitableType = medical ? destination.type === 'HOSPITAL' : ['SHELTER', 'EVACUATION_POINT', 'COMMAND_POST'].includes(destination.type);
    if (suitableType) { score += 25; reasons.push('Jenis tujuan sesuai dengan kebutuhan insiden yang diketahui.'); }
    else { score -= 20; warnings.push('Jenis tujuan mungkin tidak sesuai dengan kebutuhan utama insiden.'); }
    if (destination.verified) { score += 10; reasons.push('Titik tujuan berstatus terverifikasi.'); }
    else warnings.push('Status operasional tujuan belum diverifikasi.');
    if (destination.capacity_status === 'AVAILABLE') score += 10;
    else if (destination.capacity_status === 'FULL') { score -= 40; warnings.push('Kapasitas tujuan dilaporkan penuh.'); }
    else warnings.push('Kapasitas tujuan tidak diketahui.');
    if (victims.mobility_limited) warnings.push('Korban memiliki keterbatasan mobilitas; bantuan perpindahan mungkin diperlukan.');
    if (Number.isFinite(route_risk?.risk_score)) {
      score -= Math.round(route_risk.risk_score * 0.35);
      reasons.push(`Risiko relatif rute dinilai ${route_risk.risk_score}/100 oleh RouteRiskService.`);
    }
    if (Number.isFinite(destination.distance_m)) score -= Math.min(20, Math.round(destination.distance_m / 2500));
    return { destination_id: destination.id, suitability_score: Math.max(0, Math.min(100, score)), reasons, warnings };
  }
}

export class RescuePlanService {
  constructor(db) { this.db = db; }
  latest(incidentId) {
    const row = this.db.prepare('SELECT * FROM rescue_plans WHERE incident_id=? ORDER BY version DESC LIMIT 1').get(incidentId);
    return row ? this.hydrate(row) : null;
  }
  list(incidentId) { return this.db.prepare('SELECT * FROM rescue_plans WHERE incident_id=? ORDER BY version DESC').all(incidentId).map(row => this.hydrate(row)); }
  hydrate(row) {
    return {
      plan_id: row.plan_id, incident_id: row.incident_id, version: row.version, created_at: row.created_at,
      created_by: row.provider === 'HERMES' ? 'HERMES' : 'LOCAL_COORDINATOR', provider: row.provider, priority: row.priority,
      priority_locked: true, recommended_destination: parse(row.destination_json), recommended_route: parse(row.route_json),
      actions: parse(row.actions_json) ?? [], reasons: parse(row.reasons_json) ?? [], warnings: parse(row.warnings_json) ?? [],
      evidence: parse(row.evidence_json) ?? [], status: row.status, supersedes_plan_id: row.supersedes_plan_id,
    };
  }
  save(candidate, input, provider) {
    const previous = this.latest(input.incident_id);
    const plan = validateRescuePlan(candidate, input, provider, previous);
    const same = previous && JSON.stringify({ destination: previous.recommended_destination, route: previous.recommended_route, actions: previous.actions, warnings: previous.warnings }) === JSON.stringify({ destination: plan.recommended_destination, route: plan.recommended_route, actions: plan.actions, warnings: plan.warnings });
    if (same) return { ...previous, status: 'NO_MATERIAL_CHANGE', material_change: false };
    this.db.prepare(`INSERT INTO rescue_plans (plan_id,incident_id,version,provider,status,priority,destination_json,route_json,actions_json,reasons_json,warnings_json,evidence_json,created_at,supersedes_plan_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(plan.plan_id, plan.incident_id, plan.version, plan.created_by, plan.status, plan.priority, json(plan.recommended_destination), json(plan.recommended_route), json(plan.actions), json(plan.reasons), json(plan.warnings), json(plan.evidence), plan.created_at, plan.supersedes_plan_id);
    return { ...plan, material_change: true };
  }
}

export class CoordinatorTools {
  constructor({ incidentContext, hazards, routes, routeRisk, destinations, rescuePlans, trace, maxCalls = 12, signal }) {
    this.services = { incidentContext, hazards, routes, routeRisk, destinations, rescuePlans };
    this.trace = trace;
    this.maxCalls = maxCalls;
    this.signal = signal;
    this.calls = 0;
    this.invoked = new Set();
    this.knownHazards = new Map();
    this.knownDestinations = new Map();
    this.knownRoutes = new Map();
    this.knownRouteRisks = new Map();
  }
  async invoke(name, args, input, provider) {
    if (this.signal?.aborted) throw Object.assign(new Error('AGENT_TIMEOUT'), { code: 'AGENT_TIMEOUT' });
    if (++this.calls > this.maxCalls) throw Object.assign(new Error('MAX_TOOL_CALLS'), { code: 'MAX_TOOL_CALLS' });
    await this.trace('TOOL_CALL', name, safeSummary(args));
    if (name === 'evaluateRouteRisk') {
      if (!Array.isArray(args.routes) || args.routes.some(route => !this.knownRoutes.has(route?.route_id)) || !Array.isArray(args.hazards) || args.hazards.some(hazard => !this.knownHazards.has(hazard?.id))) throw Object.assign(new Error('UNVERIFIED_ROUTE_RISK_INPUT'), { code: 'UNVERIFIED_ROUTE_RISK_INPUT' });
    }
    if (name === 'evaluateDestination' && !this.knownDestinations.has(args.destination?.id)) throw Object.assign(new Error('UNVERIFIED_DESTINATION'), { code: 'UNVERIFIED_DESTINATION' });
    if (name === 'saveRescuePlan') {
      if (!this.invoked.has('getIncidentContext')) throw Object.assign(new Error('INCIDENT_CONTEXT_REQUIRED'), { code: 'INCIDENT_CONTEXT_REQUIRED' });
      const candidate = { ...args };
      if (candidate.recommended_destination) {
        const known = this.knownDestinations.get(candidate.recommended_destination.id);
        if (!known) throw Object.assign(new Error('UNVERIFIED_DESTINATION'), { code: 'UNVERIFIED_DESTINATION' });
        candidate.recommended_destination = known;
      }
      if (candidate.recommended_route) {
        const known = this.knownRoutes.get(candidate.recommended_route.route_id);
        const risk = this.knownRouteRisks.get(candidate.recommended_route.route_id);
        if (!known || !risk) throw Object.assign(new Error('UNVERIFIED_ROUTE'), { code: 'UNVERIFIED_ROUTE' });
        candidate.recommended_route = { ...known, ...risk };
      }
      candidate.evidence = (Array.isArray(candidate.evidence) ? candidate.evidence : []).flatMap(item => {
        const reference = item?.reference_id;
        if (item?.type === 'HAZARD' && this.knownHazards.has(reference)) {
          const hazard = this.knownHazards.get(reference);
          return [{ type: 'HAZARD', source: hazard.source ?? 'UNKNOWN', observed_at: hazard.observed_at ?? null, retrieved_at: hazard.retrieved_at ?? null, freshness: hazard.freshness ?? 'UNKNOWN', reference_id: hazard.id }];
        }
        if (item?.type === 'DESTINATION' && this.knownDestinations.has(reference)) {
          const destination = this.knownDestinations.get(reference);
          return [{ type: 'DESTINATION', source: destination.source ?? 'UNKNOWN', observed_at: destination.last_updated ?? null, retrieved_at: new Date().toISOString(), freshness: destination.verified ? 'FRESH' : 'UNKNOWN', reference_id: destination.id }];
        }
        if (item?.type === 'ROUTE' && this.knownRoutes.has(reference)) {
          const route = this.knownRoutes.get(reference);
          return [{ type: 'ROUTE', source: route.provider ?? 'UNKNOWN', observed_at: null, retrieved_at: route.retrieved_at ?? null, freshness: 'FRESH', reference_id: route.route_id }];
        }
        return [];
      });
      args = candidate;
    }
    let result;
    if (name === 'getIncidentContext') result = this.services.incidentContext.getIncidentContext(args);
    else if (name === 'getHazards') result = await this.services.hazards.getHazards(args);
    else if (name === 'getRouteAlternatives') result = await this.services.routes.getRouteAlternatives(args, this.signal);
    else if (name === 'evaluateRouteRisk') result = { routes: this.services.routeRisk.evaluateRouteRisk(args) };
    else if (name === 'getDestinations') result = await this.services.destinations.getDestinations(args);
    else if (name === 'evaluateDestination') result = this.services.destinations.evaluateDestination(args);
    else if (name === 'saveRescuePlan') result = this.services.rescuePlans.save(args, input, provider);
    else throw Object.assign(new Error('UNKNOWN_TOOL'), { code: 'UNKNOWN_TOOL' });
    this.invoked.add(name);
    if (name === 'getHazards') for (const hazard of result.hazards ?? []) if (hazard?.id) this.knownHazards.set(hazard.id, hazard);
    if (name === 'getDestinations') for (const destination of result.destinations ?? []) if (destination?.id) this.knownDestinations.set(destination.id, destination);
    if (name === 'getRouteAlternatives') for (const route of result.routes ?? []) if (route?.route_id) this.knownRoutes.set(route.route_id, route);
    if (name === 'evaluateRouteRisk') for (const route of result.routes ?? []) if (route?.route_id) this.knownRouteRisks.set(route.route_id, route);
    await this.trace('TOOL_RESULT', name, safeSummary(result));
    return result;
  }
}

export const agentToolDefinitions = [
  ['getIncidentContext', 'Read the current structured incident and locked priority.', { incident_id: { type: 'string' } }, ['incident_id']],
  ['getHazards', 'Read normalized current/cached hazards near a coordinate.', { lat: { type: 'number' }, lon: { type: 'number' }, radius_m: { type: 'number', minimum: 100, maximum: 100000 } }, ['lat', 'lon']],
  ['getRouteAlternatives', 'Request factual route geometry from the configured routing provider.', { origin: { type: 'object' }, destination: { type: 'object' }, travel_mode: { type: 'string', enum: ['driving'] } }, ['origin', 'destination', 'travel_mode']],
  ['evaluateRouteRisk', 'Deterministically compare route exposure to supplied hazards.', { routes: { type: 'array' }, hazards: { type: 'array' }, travel_mode: { type: 'string' } }, ['routes', 'hazards']],
  ['getDestinations', 'Read factual destination references near the incident.', { incident_type: { type: 'string' }, location: { type: 'object' }, radius_m: { type: 'number' }, required_capabilities: { type: 'array', items: { type: 'string' } } }, ['incident_type', 'location']],
  ['evaluateDestination', 'Deterministically score one factual destination.', { destination: { type: 'object' }, incident_type: { type: 'string' }, victims: { type: 'object' }, route_risk: { type: ['object', 'null'] } }, ['destination', 'incident_type']],
  ['saveRescuePlan', 'Validate and persist a structured rescue plan.', { type: 'object', additionalProperties: true }, ['incident_id', 'priority', 'actions', 'reasons']],
].map(([name, description, properties, required]) => ({ type: 'function', function: { name, description, parameters: properties.type === 'object' && properties.additionalProperties ? properties : { type: 'object', additionalProperties: false, properties, required } } }));

export { distanceMeters };
