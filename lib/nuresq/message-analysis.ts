import type { EmergencyIncident } from "./types";
import type {
  EmergencyMessage,
  MessageConditionFact,
  MessagePriority,
  MessageStructuredUpdate,
} from "./message-types";
import {
  detectAssertion,
  normalizeEmergencyText,
  parseSafetyFacts,
  parseVictimCount,
} from "./safety";

const MAX_MESSAGE_LENGTH = 1_200;
const NUMBER_COPY: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
};

export interface EmergencyMessageAnalysis {
  facts: MessageConditionFact[];
  summary: string[];
  signature: string;
  priority: MessagePriority;
  meaningful: boolean;
}

export function sanitizeMessageText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function fact(
  code: MessageConditionFact["code"],
  label: string,
  value: string,
  importance: MessageConditionFact["importance"],
  evidence: string,
): MessageConditionFact {
  return { code, label, value, previousValue: null, importance, evidence };
}

function waterLevelFact(text: string) {
  const bodyLevel = text.match(/\b(?:air\s+)?(?:hampir|setinggi|sebatas|mencapai)\s+(lutut|pinggang|dada|leher)\b/);
  if (bodyLevel) {
    const copy: Record<string, string> = { lutut: "Setinggi lutut", pinggang: "Setinggi pinggang", dada: "Hampir dada", leher: "Setinggi leher" };
    return fact("WATER_LEVEL", "Ketinggian air", copy[bodyLevel[1]], bodyLevel[1] === "lutut" ? "important" : "urgent", bodyLevel[0]);
  }
  const metric = text.match(/\b(\d{1,3})\s*(cm|sentimeter|meter|m)\b/);
  if (!metric || !/\bair\b/.test(text)) return null;
  const numeric = Number(metric[1]);
  const unit = metric[2] === "m" || metric[2] === "meter" ? "m" : "cm";
  const centimeters = unit === "m" ? numeric * 100 : numeric;
  return fact("WATER_LEVEL", "Ketinggian air", `${numeric} ${unit}`, centimeters >= 70 ? "urgent" : "important", metric[0]);
}

function floorFact(text: string) {
  const match = text.match(/\b(?:lantai|tingkat)\s+(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);
  if (!match) return null;
  const prefix = text.slice(Math.max(0, (match.index ?? 0) - 16), match.index ?? 0);
  if (/\b(?:tidak|bukan|belum)\s+(?:di|ke)?\s*$/.test(prefix)) return null;
  const floor = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_COPY[match[1]];
  return Number.isFinite(floor) ? fact("LOCATION_CONTEXT", "Lokasi", `Lantai ${floor}`, "important", match[0]) : null;
}

function extractFacts(value: string) {
  const text = normalizeEmergencyText(value);
  if (!text) return [];
  const result: MessageConditionFact[] = [];
  const safetyFacts = parseSafetyFacts(text);

  const waterAssertion = detectAssertion(text, {
    anchors: [/\bair\b.{0,28}\b(?:naik|meningkat|bertambah|makin|semakin|tinggi|stabil|surut|reda)\b/],
    positive: [/\bair\b.{0,24}\b(?:naik|meningkat|bertambah|makin\s+tinggi|semakin\s+tinggi|tambah\s+tinggi)\b/],
    negative: [/\bair\b.{0,16}\b(?:tidak|tak|belum)\s+(?:naik|meningkat|bertambah)\b/],
    recovered: [/\bair\b.{0,20}\b(?:sudah\s+)?(?:stabil|surut|reda)\b/],
  });
  const risingWater = safetyFacts.risingWater.evidence.length ? safetyFacts.risingWater : waterAssertion;
  if (risingWater.current === true) result.push(fact("WATER_TREND", "Air", "Meningkat", "urgent", risingWater.evidence[0] ?? "air meningkat"));
  if (risingWater.current === false && risingWater.evidence.length) result.push(fact("WATER_TREND", "Air", risingWater.recovered ? "Kembali stabil" : "Tidak meningkat", "info", risingWater.evidence[0]));

  const level = waterLevelFact(text);
  if (level) result.push(level);

  const breathing = detectAssertion(text, {
    anchors: [/\bsesak\b/, /\bsulit\s+berna[fp]as\b/, /\bnapas\s+pendek\b/, /\bterengah(?:-engah)?\b/, /\bnapas\s+(?:normal|membaik)\b/],
    positive: [/\bsesak\b/, /\bsulit\s+berna[fp]as\b/, /\bnapas\s+pendek\b/, /\bterengah(?:-engah)?\b/],
    negative: [/\b(?:tidak|tak|gak|nggak)\s+sesak\b/, /\bnapas\s+normal\b/],
    recovered: [/\bsesak\s+(?:sudah\s+)?(?:reda|hilang)\b/, /\bnapas\s+(?:sudah\s+)?(?:normal|membaik)\b/],
  });
  if (breathing.current === true) result.push(fact("BREATHING", "Pernapasan", "Kesulitan dilaporkan", "urgent", breathing.evidence[0] ?? "kesulitan bernapas"));
  if (breathing.current === false && breathing.evidence.length) result.push(fact("BREATHING", "Pernapasan", breathing.recovered ? "Dilaporkan membaik" : "Tidak sesak dilaporkan", "info", breathing.evidence[0]));

  const mobility = detectAssertion(text, {
    anchors: [/\btidak\s+bisa\s+(?:bergerak|berjalan)\b/, /\bsulit\s+(?:bergerak|berjalan)\b/, /\bbisa\s+(?:bergerak|berjalan)\b/],
    positive: [/\btidak\s+bisa\s+(?:bergerak|berjalan)\b/, /\bsulit\s+(?:bergerak|berjalan)\b/],
    negative: [/\b(?:sudah\s+)?bisa\s+(?:bergerak|berjalan)\b/],
    recovered: [/\b(?:sudah|kembali)\s+bisa\s+(?:bergerak|berjalan)\b/],
  });
  if (mobility.current === true) result.push(fact("MOBILITY", "Mobilitas", "Terbatas", "urgent", mobility.evidence[0] ?? "mobilitas terbatas"));
  if (mobility.current === false && mobility.evidence.length) result.push(fact("MOBILITY", "Mobilitas", "Dapat bergerak", "info", mobility.evidence[0]));

  const floor = floorFact(text);
  if (floor) result.push(floor);

  const victimCount = parseVictimCount(text);
  if (victimCount !== null) result.push(fact("VICTIM_COUNT", "Korban", `${victimCount} orang`, victimCount > 1 ? "important" : "info", `${victimCount} orang`));

  const battery = detectAssertion(text, {
    anchors: [/\bbaterai\b.{0,24}\b(?:rendah|lemah|habis|tinggal|sisa)\b/, /\bbaterai\s+\d{1,3}\s*%/],
    positive: [/\bbaterai\b.{0,20}\b(?:rendah|lemah|hampir\s+habis)\b/, /\bbaterai\b.{0,16}\b(?:tinggal|sisa)\s+(?:(?:[0-9]|1[0-9]|20)\s*%|sedikit)\b/],
    negative: [/\bbaterai\b.{0,12}\b(?:tidak|belum)\s+(?:rendah|lemah|habis)\b/],
  });
  if (battery.current === true) result.push(fact("BATTERY", "Baterai", "Rendah", "important", battery.evidence[0] ?? "baterai rendah"));

  if (/\b(?:butuh|perlu|minta)\s+(?:evakuasi|bantuan|ambulans|medis)\b/.test(text)) {
    const request = text.match(/\b(?:butuh|perlu|minta)\s+(?:evakuasi|bantuan|ambulans|medis)\b/)?.[0] ?? "butuh bantuan";
    result.push(fact("HELP_REQUEST", "Bantuan", request.replace(/^\w+\s+/, "").replace(/^./, (letter) => letter.toUpperCase()), "important", request));
  }

  return result;
}

function factMap(facts: MessageConditionFact[]) {
  return new Map(facts.map((item) => [item.code, item.value]));
}

export function analyzeEmergencyMessage(value: string, previousContext = ""): EmergencyMessageAnalysis {
  const text = sanitizeMessageText(value);
  const previous = factMap(extractFacts(previousContext));
  const current = extractFacts(text);
  const facts = current
    .map((item) => ({ ...item, previousValue: previous.get(item.code) ?? null }))
    .filter((item) => item.previousValue !== item.value);
  const summary = facts.map((item) => `${item.label}: ${item.value}`);
  const signature = facts
    .map((item) => `${item.code}:${item.value.toLowerCase()}`)
    .sort()
    .join("|");
  const priority: MessagePriority = facts.some((item) => item.importance === "urgent")
    ? "URGENT"
    : facts.some((item) => item.importance === "important")
      ? "IMPORTANT"
      : "NORMAL";
  return { facts, summary, signature, priority, meaningful: facts.length > 0 };
}

export function structuredUpdateFromAnalysis(messageId: string, analysis: EmergencyMessageAnalysis): MessageStructuredUpdate | null {
  if (!analysis.meaningful) return null;
  return {
    sourceMessageId: messageId,
    signature: analysis.signature,
    analysisMode: "DETERMINISTIC_LOCAL",
    facts: analysis.facts,
    summary: analysis.summary,
    status: "SUGGESTED",
    confirmedAt: null,
    dismissedAt: null,
    safetyResult: null,
  };
}

export function compactEmergencyMessage(value: string, previousContext = "") {
  const text = sanitizeMessageText(value);
  const analysis = analyzeEmergencyMessage(text, previousContext);
  if (!analysis.summary.length) return text;
  return analysis.summary.join("\n");
}

export function summarizeEmergencyContext(incident: EmergencyIncident, messages: EmergencyMessage[]) {
  const userText = messages
    .filter((message) => message.senderType === "USER_MESSAGE")
    .slice(-6)
    .map((message) => message.text)
    .join(". ");
  const analysis = analyzeEmergencyMessage(userText, incident.description);
  const lines = [
    incident.type ? `Kejadian: ${incident.type}` : null,
    incident.victim_count === null ? null : `Korban: ${incident.victim_count} orang`,
    ...analysis.summary,
  ].filter((line): line is string => Boolean(line));
  return [...new Set(lines)].join("\n") || "Belum cukup informasi untuk membuat ringkasan tanpa mengarang data.";
}

export function simplifyResponderMessage(value: string) {
  const original = sanitizeMessageText(value);
  return original
    .replace(/evakuasi tertunda akibat/gi, "evakuasi belum dapat dilakukan karena")
    .replace(/akses sisi ([a-z]+) terputus/gi, "jalur dari arah $1 tidak dapat dilalui")
    .replace(/tetap berada di lokasi/gi, "tetap di lokasi")
    .replace(/apabila memungkinkan/gi, "jika memungkinkan");
}
