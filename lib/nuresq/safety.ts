import type { SosDraft } from "./types";

interface SafetySignal {
  id: string;
  reason: string;
  score: number;
  forcesCritical?: boolean;
}

export type AssertionState = "POSITIVE" | "NEGATIVE" | "HISTORICAL" | "RECOVERED" | "UNKNOWN";

export interface StructuredFact {
  state: AssertionState;
  current: boolean | null;
  historical: boolean;
  recovered: boolean;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

interface AssertionSpec {
  anchors: RegExp[];
  positive?: RegExp[];
  negative?: RegExp[];
  recovered?: RegExp[];
  ambiguous?: RegExp[];
}

export interface SafetyFacts {
  breathing: StructuredFact;
  unconscious: StructuredFact;
  bleeding: StructuredFact & { controlled: boolean };
  risingWater: StructuredFact;
}

const emptyFact = (): StructuredFact => ({
  state: "UNKNOWN",
  current: null,
  historical: false,
  recovered: false,
  confidence: "low",
  evidence: [],
});

export function normalizeEmergencyText(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[!?;]+/g, ".").replace(/\s+/g, " ").trim();
}

function clauses(value: string) {
  return normalizeEmergencyText(value)
    .split(/\s*(?:\.|,|\b(?:tetapi|namun|sedangkan)\b)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function detectNegation(clause: string, matchIndex = clause.length) {
  const prefix = clause.slice(Math.max(0, matchIndex - 34), matchIndex);
  return /(?:^|\s)(?:tidak|tak|bukan|tanpa|enggak|nggak|gak|ga|tiada|belum)(?:\s+ada)?\s*$/.test(prefix)
    || /(?:tidak|tak|tanpa|tiada)\s+ada\s+$/.test(prefix);
}

export function detectTemporalContext(clause: string) {
  if (/\b(?:tadi|sebelumnya|sempat|pernah|kemarin|beberapa saat lalu|awalnya)\b/.test(clause)) return "HISTORICAL" as const;
  if (/\b(?:sekarang|saat ini|kini|masih|terus)\b/.test(clause)) return "CURRENT" as const;
  return "UNSPECIFIED" as const;
}

export function detectRecoveryContext(clause: string) {
  return /\b(?:sudah|telah|kembali|sekarang|kini)\b.{0,24}\b(?:sadar|berhenti|stabil|reda|terkendali|normal|surut)\b/.test(clause)
    || /\b(?:tidak|tak)\s+(?:lagi|kembali)\b/.test(clause)
    || /\bberhasil\s+(?:dihentikan|dikendalikan)\b/.test(clause);
}

function matchingEvidence(clause: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(clause));
}

/** Bind negation and time words to the nearby concept instead of a global substring. */
export function detectAssertion(description: string, spec: AssertionSpec): StructuredFact {
  const evidence: string[] = [];
  let current: boolean | null = null;
  let historical = false;
  let recovered = false;
  let explicit = false;

  for (const clause of clauses(description)) {
    const hasAnchor = matchingEvidence(clause, spec.anchors);
    const recoversPriorAssertion = historical && matchingEvidence(clause, spec.recovered ?? []);
    if (!hasAnchor && !recoversPriorAssertion) continue;
    evidence.push(clause);
    const temporal = detectTemporalContext(clause);
    const recovery = matchingEvidence(clause, spec.recovered ?? []) || detectRecoveryContext(clause);
    const explicitNegative = matchingEvidence(clause, spec.negative ?? []);
    const explicitPositive = matchingEvidence(clause, spec.positive ?? []);
    const ambiguous = matchingEvidence(clause, spec.ambiguous ?? []);

    if (recovery) {
      current = false;
      historical = true;
      recovered = true;
      explicit = true;
      continue;
    }
    if (explicitNegative) {
      current = false;
      explicit = true;
      continue;
    }
    if (explicitPositive) {
      if (temporal === "HISTORICAL") historical = true;
      else current = true;
      explicit = true;
      continue;
    }

    const anchor = spec.anchors.map((pattern) => clause.match(pattern)).find((match): match is RegExpMatchArray => Boolean(match));
    const negated = anchor ? detectNegation(clause, anchor.index ?? 0) : false;
    if (negated) {
      current = false;
      explicit = true;
    } else if (temporal === "HISTORICAL") {
      historical = true;
      explicit = true;
    } else if (!ambiguous) {
      current = true;
      explicit = true;
    }
  }

  const state: AssertionState = recovered
    ? "RECOVERED"
    : current === true
      ? "POSITIVE"
      : current === false
        ? "NEGATIVE"
        : historical
          ? "HISTORICAL"
          : "UNKNOWN";
  return { state, current, historical, recovered, confidence: explicit ? "high" : evidence.length ? "medium" : "low", evidence };
}

export function parseSafetyFacts(description: string): SafetyFacts {
  const breathing = detectAssertion(description, {
    anchors: [/\b(?:napas|nafas|bernapas|bernafas)\b/],
    positive: [/\b(?:tidak|tak|gak|nggak)\s+berna[fp]as\b/, /\b(?:napas|nafas)\s+berhenti\b/, /\btidak\s+ada\s+(?:napas|nafas)\b/],
    negative: [/\b(?:napas|nafas)\s+(?:normal|baik)\b/, /\bbernapas\s+normal\b/],
  });
  if (breathing.evidence.length && /\b(?:napas|nafas|bernapas|bernafas)\s+(?:normal|baik)\b/.test(normalizeEmergencyText(description))) {
    breathing.current = false;
    breathing.state = "NEGATIVE";
  }

  const unconscious = detectAssertion(description, {
    anchors: [/\bpingsan\b/, /\b(?:tidak|tak)\s+sadar\b/, /\btidak\s+merespons?\b/, /\btidak\s+respon\b/, /\bsadar\b/],
    positive: [/\b(?:tidak|tak)\s+sadar\b/, /\btidak\s+merespons?\b/, /\btidak\s+respon\b/],
    negative: [/\b(?:tidak|tak|gak|nggak)\s+pingsan\b/, /\b(?:masih|tetap)\s+sadar\b/],
    recovered: [/\b(?:sudah|telah|kembali)\s+sadar\b/, /\bsadar\s+kembali\b/],
  });

  const bleeding = detectAssertion(description, {
    anchors: [/\bperdarahan\b/, /\bpendarahan\b/, /\bberdarah\b/, /\bdarah\b/],
    positive: [
      /\b(?:darah|perdarahan|pendarahan).{0,24}(?:masih|terus)\s+(?:keluar|mengalir)\b/,
      /\bdarah\s+(?:tidak|tak|belum)\s+berhenti\b/,
      /\b(?:mengucur|menyembur)\b/,
      /\bperdarahan\s+(?:aktif|berat)\b/,
    ],
    negative: [
      /\b(?:tidak|tak|tanpa|tiada)\s+ada\s+(?:perdarahan|pendarahan)\b/,
      /\b(?:tidak|tak)\s+berdarah\b/,
    ],
    recovered: [
      /\b(?:darah|perdarahan|pendarahan).{0,20}(?:sudah|telah)\s+berhenti\b/,
      /\b(?:perdarahan|pendarahan).{0,20}(?:sudah|telah)\s+terkendali\b/,
      /\btidak\s+berdarah\s+lagi\b/,
      /\bberhasil\s+dihentikan\b/,
      /\b(?:sekarang|kini)\s+(?:sudah\s+)?berhenti\b/,
    ],
    ambiguous: [/^.*\bdarah\b.*$/],
  });

  const risingWater = detectAssertion(description, {
    anchors: [/\bair\b.{0,20}\b(?:naik|meningkat|bertambah|stabil|reda|surut)\b/, /\barus\s+deras\b/, /\bterseret\s+arus\b/],
    positive: [/\bair\b.{0,16}\b(?:naik|meningkat|bertambah)\b/, /\barus\s+deras\b/, /\bterseret\s+arus\b/],
    negative: [/\bair\b.{0,12}\b(?:tidak|tak|belum)\s+(?:naik|meningkat|bertambah)\b/],
    recovered: [/\b(?:sekarang|kini|sudah|telah)\b.{0,20}\b(?:stabil|reda|surut)\b/, /\bair\b.{0,20}\b(?:stabil|reda|surut)\b/],
  });
  return { breathing, unconscious, bleeding: { ...bleeding, controlled: bleeding.recovered }, risingWater };
}

export function detectSafetySignals(description: string): SafetySignal[] {
  const text = normalizeEmergencyText(description);
  if (!text) return [];
  const facts = parseSafetyFacts(text);
  const signals: SafetySignal[] = [];

  if (facts.breathing.current === true) signals.push({ id: "NOT_BREATHING", reason: "korban dilaporkan tidak bernapas", score: 10, forcesCritical: true });
  if (facts.bleeding.current === true) {
    signals.push({ id: "UNCONTROLLED_BLEEDING", reason: "perdarahan dilaporkan belum terkendali", score: 10, forcesCritical: true });
  } else if (facts.bleeding.recovered) {
    signals.push({ id: "CONTROLLED_BLEEDING", reason: "perdarahan dilaporkan sudah terkendali", score: 2 });
  } else if (facts.bleeding.state === "UNKNOWN" && facts.bleeding.evidence.length) {
    signals.push({ id: "BLEEDING_STATUS_UNKNOWN", reason: "status perdarahan perlu dikonfirmasi", score: 2 });
  }
  if (facts.unconscious.current === true) signals.push({ id: "UNCONSCIOUS", reason: "ada korban tidak sadar atau tidak merespons", score: 5 });
  else if (facts.unconscious.historical) signals.push({ id: "UNCONSCIOUS_HISTORY", reason: "ada riwayat tidak sadar; kondisi saat ini perlu dikonfirmasi", score: 2 });
  if (facts.risingWater.current === true) signals.push({ id: "RISING_WATER", reason: "air atau arus dilaporkan memburuk", score: 4 });

  const trapped = detectAssertion(text, { anchors: [/\bterjebak\b/, /\btertimbun\b/, /\bterkunci\b/, /\btidak\s+bisa\s+keluar\b/] });
  if (trapped.current === true) signals.push({ id: "TRAPPED", reason: "korban tidak dapat keluar sendiri", score: 3 });
  if (/\b(?:asap\s+tebal|sulit\s+bernapas\s+karena\s+asap|api\s+membesar)\b/.test(text)) signals.push({ id: "FIRE_SMOKE", reason: "paparan asap atau api meningkat", score: 4 });
  return signals;
}

export function calculateRisk(draft: SosDraft) {
  const reasons: string[] = [];
  const signals = detectSafetySignals(draft.description);
  let score = signals.reduce((total, signal) => total + signal.score, 0);
  reasons.push(...signals.map((signal) => signal.reason));

  if (draft.mobilityLimited) {
    score += 3;
    reasons.push("ada korban dengan mobilitas terbatas");
  }
  if (draft.victimCount !== null && draft.victimCount > 1) {
    score += 2;
    reasons.push(`${draft.victimCount} orang membutuhkan bantuan`);
  }
  if (draft.waterLevel >= 70) {
    score += 3;
    reasons.push("ketinggian air berisiko");
  }
  if (draft.type === "Kebakaran" || draft.type === "Darurat Medis") {
    score += 3;
    reasons.push("jenis kejadian membutuhkan respons cepat");
  }
  if (draft.injuryAssessment) {
    reasons.push(...draft.injuryAssessment.reasons);
    if (draft.injuryAssessment.priority === "kritis") score += 12;
    if (draft.injuryAssessment.priority === "tinggi") score += 5;
  }

  const forcedCritical = signals.find((signal) => signal.forcesCritical);
  const injuryCritical = draft.injuryAssessment?.priority === "kritis";
  const isCritical = Boolean(forcedCritical) || injuryCritical || score >= 12;
  const isHigh = score >= 4;
  return {
    level: isCritical ? "KRITIS" : isHigh ? "PRIORITAS TINGGI" : "PRIORITAS SEDANG",
    tone: isCritical ? "critical" : isHigh ? "high" : "medium",
    reasons: reasons.length ? [...new Set(reasons)] : ["laporan membutuhkan konfirmasi kondisi"],
    ruleCode: forcedCritical?.id ?? (injuryCritical ? "INJURY_RED_FLAG" : null) ?? (isCritical ? "MULTIPLE_HIGH_RISK" : isHigh ? "RISK_SCORE_HIGH" : "RISK_SCORE_MEDIUM"),
    engineLabel: "Aturan keselamatan di perangkat",
  } as const;
}

const numberWords: Record<string, number> = {
  satu: 1, seorang: 1, dua: 2, kedua: 2, tiga: 3, empat: 4, lima: 5,
  enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
};

function parsedNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  return numberWords[value] ?? null;
}

export function parseVictimCount(description: string): number | null {
  const text = normalizeEmergencyText(description);
  if (!text) return null;
  if (/\b(?:saya|aku)\s+(?:sendiri|sendirian)\b/.test(text)) return 1;

  const explicit = text.match(/\b(?:ada|terdapat|jumlahnya|sebanyak)?\s*(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+(?:orang|korban)\b/);
  if (explicit) return parsedNumber(explicit[1]);
  const collective = text.match(/\bkami\s+ber(dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/);
  if (collective) return parsedNumber(collective[1]);
  const dependants = text.match(/\b(?:saya|aku)\s+(?:dan|bersama|dengan)\s+(\d+|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+(?:anak|orang|korban)\b/);
  if (dependants) {
    const count = parsedNumber(dependants[1]);
    return count === null ? null : count + 1;
  }
  if (/\b(?:saya|aku)\s+(?:bersama|dengan|dan)\s+(?:ibu|ayah|suami|istri|anak|adik|kakak|teman)\b/.test(text)
    && !/\b(?:mencari|menunggu|menghubungi)\b/.test(text)) return 2;
  return null;
}

export function parseEmergencyDescription(description: string) {
  const lower = normalizeEmergencyText(description);
  const waterMatch = lower.match(/(\d+)\s*(?:cm|sentimeter)/);
  return {
    victimCount: parseVictimCount(lower),
    mobilityLimited: /\b(?:tidak|tak)\s+bisa\s+berjalan\b/.test(lower)
      || /\bsulit\s+berjalan\b/.test(lower)
      || /\b(?:lansia|kursi roda)\b/.test(lower),
    waterLevel: waterMatch ? Number(waterMatch[1]) : /\bsetinggi\s+pinggang\b|\bair\s+.*pinggang\b/.test(lower) ? 90 : 0,
    facts: parseSafetyFacts(lower),
  };
}

export function unknownSafetyFact() {
  return emptyFact();
}
