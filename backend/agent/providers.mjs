import { agentToolDefinitions } from './services.mjs';
import { HERMES_RESCUE_COORDINATOR_PROMPT } from './system-prompt.mjs';

function warningForState(label, state) {
  return ['LIVE', 'CACHED'].includes(state) ? null : `${label}: DATA_UNAVAILABLE (${state ?? 'UNKNOWN'}).`;
}

export class LocalCoordinatorProvider {
  constructor() { this.id = 'local'; this.label = 'LOCAL_COORDINATOR'; this.ready = true; }
  async processIncident(input, tools) {
    const context = await tools.invoke('getIncidentContext', { incident_id: input.incident_id }, input, this.id);
    const actions = ['FOLLOW_LOCAL_GUIDE'];
    const reasons = ['Rencana dibuat oleh orkestrator deterministik dari data backend yang tersedia.'];
    const warnings = [];
    const evidence = [];
    if (context.victims?.mobility_limited) actions.push('ASSIST_MOBILITY');
    if (context.incident_type === 'DARURAT_MEDIS') actions.push('REQUEST_MEDICAL_SUPPORT');
    if (!context.location) {
      actions.push('PROVIDE_LOCATION', 'STAY_PUT');
      warnings.push('Lokasi insiden tidak tersedia; rute dan tujuan tidak dapat dihitung.');
      return tools.invoke('saveRescuePlan', {
        incident_id: input.incident_id, priority: input.priority, recommended_destination: null, recommended_route: null,
        actions, reasons, warnings, evidence, status: 'ACTIVE',
      }, input, this.id);
    }

    const hazardResult = await tools.invoke('getHazards', { ...context.location, radius_m: 15_000 }, input, this.id);
    const hazardWarning = warningForState('Hazard', hazardResult.data_state);
    if (hazardWarning) warnings.push(hazardWarning);
    for (const hazard of hazardResult.hazards.slice(0, 20)) evidence.push({ type: 'HAZARD', source: hazard.source ?? 'UNKNOWN', observed_at: hazard.observed_at ?? null, retrieved_at: hazard.retrieved_at ?? hazardResult.generated_at, freshness: hazard.freshness ?? 'UNKNOWN', reference_id: hazard.id ?? null });

    const required = context.incident_type === 'DARURAT_MEDIS' ? ['MEDICAL'] : [];
    const destinationResult = await tools.invoke('getDestinations', { incident_type: context.incident_type, location: context.location, radius_m: 25_000, required_capabilities: required }, input, this.id);
    const destinationWarning = warningForState('Destination', destinationResult.data_state);
    if (destinationWarning) warnings.push(destinationWarning);
    if (!destinationResult.destinations.length) {
      warnings.push('NO_VERIFIED_DESTINATION: tidak ada titik tujuan faktual pada area pencarian.');
      actions.push('STAY_PUT');
      return tools.invoke('saveRescuePlan', {
        incident_id: input.incident_id, priority: input.priority, recommended_destination: null, recommended_route: null,
        actions, reasons, warnings, evidence, status: 'ACTIVE',
      }, input, this.id);
    }

    const preferredTypes = context.incident_type === 'DARURAT_MEDIS' ? ['HOSPITAL'] : ['SHELTER', 'EVACUATION_POINT', 'COMMAND_POST'];
    const candidates = [...destinationResult.destinations].sort((a, b) => Number(preferredTypes.includes(b.type)) - Number(preferredTypes.includes(a.type)) || a.distance_m - b.distance_m).slice(0, 2);
    const evaluated = [];
    for (const destination of candidates) {
      const routeResult = await tools.invoke('getRouteAlternatives', { origin: context.location, destination: destination.location, travel_mode: 'driving' }, input, this.id);
      let route = null;
      let routeRisk = null;
      if (routeResult.routes.length) {
        const risks = await tools.invoke('evaluateRouteRisk', { routes: routeResult.routes, hazards: hazardResult.hazards, travel_mode: 'driving' }, input, this.id);
        routeRisk = [...risks.routes].sort((a, b) => a.risk_score - b.risk_score)[0] ?? null;
        const factualRoute = routeResult.routes.find(item => item.route_id === routeRisk?.route_id) ?? null;
        if (factualRoute && routeRisk) route = { ...factualRoute, ...routeRisk };
      }
      const score = await tools.invoke('evaluateDestination', { destination, incident_type: context.incident_type, victims: context.victims, route_risk: routeRisk }, input, this.id);
      evaluated.push({ destination, route, score });
    }
    const selected = evaluated.sort((a, b) => b.score.suitability_score - a.score.suitability_score || (a.route?.risk_score ?? 101) - (b.route?.risk_score ?? 101))[0];
    warnings.push(...selected.score.warnings);
    reasons.push(...selected.score.reasons);
    if (!selected.route) warnings.push('Routing tidak tersedia; tidak ada geometri rute yang direkomendasikan.');
    else {
      actions.push('EVACUATE');
      reasons.push(`Rute ${selected.route.route_id} memiliki risiko relatif ${selected.route.risk_score}/100 berdasarkan data yang tersedia.`);
      evidence.push({ type: 'ROUTE', source: selected.route.provider, retrieved_at: selected.route.retrieved_at, freshness: 'FRESH', reference_id: selected.route.route_id });
    }
    evidence.push({ type: 'DESTINATION', source: selected.destination.source ?? 'EXISTING_REFERENCE', observed_at: selected.destination.last_updated ?? null, retrieved_at: new Date().toISOString(), freshness: selected.destination.verified ? 'FRESH' : 'UNKNOWN', reference_id: selected.destination.id });
    return tools.invoke('saveRescuePlan', {
      incident_id: input.incident_id,
      priority: input.priority,
      recommended_destination: selected.destination,
      recommended_route: selected.route,
      actions,
      reasons,
      warnings,
      evidence,
      status: 'ACTIVE',
    }, input, this.id);
  }
}

function parseJson(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { throw Object.assign(new Error('INVALID_HERMES_OUTPUT'), { code: 'INVALID_HERMES_OUTPUT' }); }
}

export class HermesCoordinatorProvider {
  constructor(env = process.env, fetcher = fetch) {
    this.id = 'hermes';
    this.label = 'HERMES';
    this.endpoint = String(env.HERMES_ENDPOINT ?? '').trim();
    this.apiKey = String(env.HERMES_API_KEY ?? '').trim();
    this.model = String(env.HERMES_MODEL ?? '').trim();
    this.fetcher = fetcher;
    this.ready = Boolean(this.endpoint && this.apiKey && this.model);
  }
  async processIncident(input, tools, signal) {
    if (!this.ready) throw Object.assign(new Error('HERMES_NOT_CONFIGURED'), { code: 'HERMES_NOT_CONFIGURED' });
    const messages = [
      { role: 'system', content: HERMES_RESCUE_COORDINATOR_PROMPT },
      { role: 'user', content: JSON.stringify({ task: 'CREATE_RESCUE_PLAN', incident: input }) },
    ];
    let savedPlan = null;
    let usedTool = false;
    for (let turn = 0; turn < tools.maxCalls; turn += 1) {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages, tools: agentToolDefinitions, tool_choice: 'auto', temperature: 0 }),
      });
      if (!response.ok) throw Object.assign(new Error(`HERMES_HTTP_${response.status}`), { code: 'HERMES_UNAVAILABLE' });
      const body = await response.json();
      const message = body?.choices?.[0]?.message;
      if (!message) throw Object.assign(new Error('INVALID_HERMES_RESPONSE'), { code: 'INVALID_HERMES_RESPONSE' });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (toolCalls.length) {
        usedTool = true;
        messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls });
        for (const call of toolCalls) {
          const name = call?.function?.name;
          const args = parseJson(call?.function?.arguments ?? '{}');
          const result = await tools.invoke(name, args, input, this.id);
          if (name === 'saveRescuePlan') savedPlan = result;
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
        }
        if (savedPlan) return savedPlan;
        continue;
      }
      if (!usedTool) throw Object.assign(new Error('HERMES_DID_NOT_USE_TOOLS'), { code: 'HERMES_DID_NOT_USE_TOOLS' });
      const candidate = parseJson(message.content);
      return tools.invoke('saveRescuePlan', candidate, input, this.id);
    }
    throw Object.assign(new Error('MAX_TOOL_CALLS'), { code: 'MAX_TOOL_CALLS' });
  }
}

export function createCoordinatorProvider(env = process.env, fetcher = fetch) {
  return String(env.AGENT_PROVIDER ?? 'local').toLowerCase() === 'hermes'
    ? new HermesCoordinatorProvider(env, fetcher)
    : new LocalCoordinatorProvider();
}
