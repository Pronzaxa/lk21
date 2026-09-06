import { randomUUID } from 'node:crypto';

export const AGENT_STATUSES = new Set(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING']);
export const TRIGGER_TYPES = new Set(['INCIDENT_CREATED', 'INCIDENT_UPDATED', 'HAZARD_CHANGED', 'MANUAL_RECHECK']);
export const PLAN_STATUSES = new Set(['ACTIVE', 'NO_MATERIAL_CHANGE']);
const PRIORITIES = ['PRIORITAS SEDANG', 'PRIORITAS TINGGI', 'KRITIS'];
const DESTINATION_TYPES = new Set(['HOSPITAL', 'SHELTER', 'EVACUATION_POINT', 'COMMAND_POST', 'OTHER']);
const ACTIONS = new Set(['EVACUATE', 'STAY_PUT', 'ASSIST_MOBILITY', 'REQUEST_MEDICAL_SUPPORT', 'PROVIDE_LOCATION', 'FOLLOW_LOCAL_GUIDE']);

export const isUuid = value => /^(?:NR-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
export const priorityRank = value => PRIORITIES.indexOf(value);

export function publicErrorCode(error) {
  const value = String(error?.code ?? error?.message ?? 'AGENT_FAILED').toUpperCase();
  if (value.includes('TIMEOUT') || value.includes('ABORT')) return 'AGENT_TIMEOUT';
  if (value.includes('PRIORITY')) return 'PRIORITY_LOCK_VIOLATION';
  if (value.includes('ROUTE')) return 'ROUTING_UNAVAILABLE';
  if (value.includes('DESTINATION')) return 'DESTINATION_UNAVAILABLE';
  if (value.includes('HAZARD')) return 'HAZARD_UNAVAILABLE';
  if (value.includes('INVALID')) return 'INVALID_AGENT_OUTPUT';
  return 'AGENT_FAILED';
}

function finite(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function validateCoordinate(location, required = false) {
  if (location == null && !required) return null;
  if (!location || !finite(location.lat, -90, 90) || !finite(location.lon, -180, 180)) {
    throw Object.assign(new Error('INVALID_COORDINATES'), { code: 'INVALID_COORDINATES' });
  }
  return {
    lat: location.lat,
    lon: location.lon,
    accuracy_m: Number.isFinite(location.accuracy_m) && location.accuracy_m >= 0 ? location.accuracy_m : null,
  };
}

export function boundedRadius(value, fallback = 15_000) {
  const radius = value == null ? fallback : Number(value);
  if (!finite(radius, 100, 100_000)) throw Object.assign(new Error('INVALID_RADIUS'), { code: 'INVALID_RADIUS' });
  return radius;
}

function cleanStrings(value, limit = 12, length = 500) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    .slice(0, limit)
    .map(item => item.slice(0, length));
}

function normalizeDestination(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim() || typeof value.name !== 'string' || !value.name.trim()) {
    throw Object.assign(new Error('INVALID_DESTINATION'), { code: 'INVALID_DESTINATION' });
  }
  const type = String(value.type ?? 'OTHER').toUpperCase();
  if (!DESTINATION_TYPES.has(type)) throw Object.assign(new Error('INVALID_DESTINATION_TYPE'), { code: 'INVALID_DESTINATION_TYPE' });
  return {
    id: value.id.slice(0, 200),
    name: value.name.slice(0, 300),
    type,
    location: validateCoordinate(value.location, false),
    capacity_status: ['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'].includes(value.capacity_status) ? value.capacity_status : 'UNKNOWN',
    verified: value.verified === true,
  };
}

function normalizeRoute(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || typeof value.route_id !== 'string' || !value.route_id.trim()) {
    throw Object.assign(new Error('INVALID_ROUTE'), { code: 'INVALID_ROUTE' });
  }
  const coordinates = value.geometry?.type === 'LineString' && Array.isArray(value.geometry.coordinates)
    ? value.geometry.coordinates.slice(0, 10_000).filter(item => Array.isArray(item) && finite(item[0], -180, 180) && finite(item[1], -90, 90)).map(item => [item[0], item[1]])
    : [];
  if (coordinates.length < 2) throw Object.assign(new Error('INVALID_ROUTE_GEOMETRY'), { code: 'INVALID_ROUTE_GEOMETRY' });
  if (!Number.isFinite(value.distance_m) || value.distance_m < 0 || !Number.isFinite(value.duration_s) || value.duration_s < 0 || !finite(value.risk_score, 0, 100)) {
    throw Object.assign(new Error('INVALID_ROUTE_METRICS'), { code: 'INVALID_ROUTE_METRICS' });
  }
  return {
    route_id: value.route_id.slice(0, 200),
    geometry: { type: 'LineString', coordinates },
    risk_score: Math.round(value.risk_score),
    distance_m: Math.round(value.distance_m),
    duration_s: Math.round(value.duration_s),
    reasons: cleanStrings(value.reasons, 10, 300),
    provider: typeof value.provider === 'string' ? value.provider.slice(0, 100) : 'UNKNOWN',
    retrieved_at: Number.isFinite(Date.parse(value.retrieved_at ?? '')) ? new Date(value.retrieved_at).toISOString() : new Date().toISOString(),
  };
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string' || typeof item.source !== 'string') return [];
    return [{
      type: item.type.slice(0, 80),
      source: item.source.slice(0, 200),
      observed_at: Number.isFinite(Date.parse(item.observed_at ?? '')) ? new Date(item.observed_at).toISOString() : null,
      retrieved_at: Number.isFinite(Date.parse(item.retrieved_at ?? '')) ? new Date(item.retrieved_at).toISOString() : null,
      freshness: typeof item.freshness === 'string' ? item.freshness.slice(0, 40) : 'UNKNOWN',
      reference_id: typeof item.reference_id === 'string' ? item.reference_id.slice(0, 200) : null,
    }];
  });
}

export function validateRescuePlan(candidate, input, provider, previous = null) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw Object.assign(new Error('INVALID_RESCUE_PLAN'), { code: 'INVALID_RESCUE_PLAN' });
  }
  if (candidate.incident_id && candidate.incident_id !== input.incident_id) {
    throw Object.assign(new Error('INCIDENT_MISMATCH'), { code: 'INCIDENT_MISMATCH' });
  }
  if (candidate.priority && candidate.priority !== input.priority) {
    throw Object.assign(new Error('PRIORITY_LOCK_VIOLATION'), { code: 'PRIORITY_LOCK_VIOLATION' });
  }
  const status = PLAN_STATUSES.has(candidate.status) ? candidate.status : 'ACTIVE';
  const destination = normalizeDestination(candidate.recommended_destination);
  const route = normalizeRoute(candidate.recommended_route);
  if (route && !destination) throw Object.assign(new Error('ROUTE_WITHOUT_DESTINATION'), { code: 'ROUTE_WITHOUT_DESTINATION' });
  const actions = cleanStrings(candidate.actions, 12, 80).filter(action => ACTIONS.has(action));
  const reasons = cleanStrings(candidate.reasons, 20, 500);
  const warnings = cleanStrings(candidate.warnings, 20, 500);
  if (!actions.length) actions.push(input.location ? 'FOLLOW_LOCAL_GUIDE' : 'PROVIDE_LOCATION');
  if (!reasons.length) reasons.push('Rencana dibatasi pada data terverifikasi yang tersedia saat pemrosesan.');
  return {
    plan_id: isUuid(candidate.plan_id) ? candidate.plan_id : randomUUID(),
    incident_id: input.incident_id,
    version: Number.isInteger(candidate.version) && candidate.version > 0 ? candidate.version : (previous?.version ?? 0) + 1,
    created_at: new Date().toISOString(),
    created_by: provider === 'hermes' ? 'HERMES' : 'LOCAL_COORDINATOR',
    provider: provider.toUpperCase(),
    priority: input.priority,
    priority_locked: true,
    recommended_destination: destination,
    recommended_route: route,
    actions,
    reasons,
    warnings,
    evidence: normalizeEvidence(candidate.evidence),
    status,
    supersedes_plan_id: previous?.plan_id ?? null,
  };
}

export function safeSummary(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return { count: value.length };
  if (typeof value !== 'object') return String(value).slice(0, 300);
  const summary = {};
  for (const key of ['data_state', 'status', 'incident_id', 'priority', 'route_id', 'risk_score', 'destination_id', 'suitability_score', 'plan_id', 'version', 'count']) {
    if (value[key] !== undefined) summary[key] = value[key];
  }
  for (const key of ['hazards', 'routes', 'destinations', 'warnings', 'reasons']) {
    if (Array.isArray(value[key])) summary[`${key}_count`] = value[key].length;
  }
  return summary;
}
