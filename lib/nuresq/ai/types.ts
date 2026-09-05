export type LocalAIState = "UNAVAILABLE" | "MODEL_NOT_INSTALLED" | "LOADING" | "READY" | "FAILED" | "RULE_FALLBACK";
export type IncidentLabel = "FLOOD" | "EARTHQUAKE" | "FIRE" | "LANDSLIDE" | "MEDICAL" | "TRAPPED" | "EVACUATION_REQUEST" | "GENERAL_GUIDANCE" | "OTHER";
export interface ClassificationResult { label: IncidentLabel; confidence: number; source: "LOCAL_AI" | "RULE_PARSER"; }
export interface GuideMatch { id: string; confidence: number; }
export interface LocalAIAnalysis { classification: ClassificationResult; guides: GuideMatch[]; state: LocalAIState; }
export interface LocalEmergencyAI {
  initialize(): Promise<void>;
  getState(): LocalAIState;
  classifyIncident(text: string): Promise<ClassificationResult>;
  embed(text: string): Promise<number[]>;
  findRelevantGuide(text: string): Promise<GuideMatch[]>;
  analyze(text: string): Promise<LocalAIAnalysis>;
}
