import { parseEmergencyDescription, calculateRisk } from '../safety';
import type { SosDraft } from '../types';
import type { LocalAIAnalysis, IncidentLabel } from './types';
import { getConfig } from '../../../config/nuresq.config';

export const normalizeInput = (text:string) => text.normalize('NFKC').toLowerCase().replace(/\b(gak|nggak|enggak|ga|tdk)\b/g,'tidak').replace(/\budah\b/g,'sudah').replace(/\bkejebak\b/g,'terjebak').replace(/\bsepinggang\b/g,'setinggi pinggang').replace(/\bgimana\b/g,'bagaimana').replace(/\s+/g,' ').trim();
const patterns: [IncidentLabel,RegExp][] = [
  ['FLOOD',/\bbanjir\w*\b|\bair\b.{0,35}\b(?:naik|tinggi|masuk|meluap|terendam)\b/],
  ['EARTHQUAKE',/\bgempa\b|\b(?:rumah|lantai|bangunan)\s+(?:bergoyang|bergetar)/],
  ['FIRE',/\bkebakaran\b|\bterbakar\b|\basap\s+tebal\b|\bapi\s+membesar\b/],
  ['LANDSLIDE',/\blongsor\b|\btanah\s+bergerak\b/],
  ['MEDICAL',/\bsesak\b|\bpingsan\b|\b(?:tidak|belum)\s+(?:sadar|bernapas|bisa (?:napas|bernapas))\b|\bperdarahan\b/],
  ['TRAPPED',/\bterjebak\b|\btertimbun\b/],['EVACUATION_REQUEST',/\bevakuasi\b|\bminta (?:bantuan|tolong)\b/],
];
export function fuseFacts(input:string,ai:LocalAIAnalysis|null,confirmedType:SosDraft['type']=null) {
  const text=normalizeInput(input);const parsed=parseEmergencyDescription(text);
  const positive:IncidentLabel[]=[];const negative:IncidentLabel[]=[];
  for(const [label,pattern] of patterns) {
    for(const clause of text.split(/[.!?,;]|\b(?:tapi|tetapi|namun)\b/)) {
      const match=pattern.exec(clause);if(!match)continue;
      if(/(?:tidak (?:ada|terjadi)|bukan|tanpa)\s*$/.test(clause.slice(0,match.index)))negative.push(label);else positive.push(label);
    }
  }
  const educational=/\b(?:cuma mau tahu|hanya bertanya|apa yang harus|bagaimana|kalau|jika|simulasi|latihan)\b/.test(text)&&!/\b(?:sekarang|saat ini|tolong|terjebak)\b/.test(text);
  const candidate=ai?.classification;
  const modelAccepted=candidate?.source==='LOCAL_AI'&&candidate.confidence>=getConfig().localAI.classificationThreshold&&!negative.includes(candidate.label);
  const label:IncidentLabel=positive[0]??(educational?'GENERAL_GUIDANCE':modelAccepted?candidate!.label:'OTHER');
  const source=positive.length||educational||!modelAccepted?'RULE_PARSER':'LOCAL_AI';
  const draft:SosDraft={type:confirmedType,description:text,victimCount:parsed.victimCount,mobilityLimited:parsed.mobilityLimited,waterLevel:parsed.waterLevel,injuryAssessment:null};
  // Model candidates never enter the authoritative safety draft.
  const safety=calculateRisk(draft);
  return {text,incidentType:{value:label,source,confidence:source==='LOCAL_AI'?candidate!.confidence:positive.length?1:0},
    explicit: {victimCount:{value:parsed.victimCount,source:'RULE_PARSER'},waterLevel:{value:parsed.waterLevel,source:'RULE_PARSER'},mobilityLimited:{value:parsed.mobilityLimited,source:'RULE_PARSER'}, assertions:parsed.facts},
    negatedTypes:[...new Set(negative)],educational,parsed,draft,safety,locked_priority:safety.level};
}
