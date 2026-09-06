export interface NuresqConfig {
  mode: "AUTO" | "FORCE_OFFLINE" | "FORCE_ONLINE";
  assistantModel: "AUTO" | "LOCAL" | "GEMINI";
  backendUrl: string;
  backendHealthTimeoutMs: number;
  assistantTimeoutMs: number;
  healthPollMs: number;
  localAI: { enabled: boolean; runtime: "GGUF_SERVER" | "ONNX_WEB"; serverUrl: string; modelPath: string; version: string; classificationThreshold: number; guideThreshold: number; inferenceTimeoutMs: number; loadTimeoutMs: number };
  offlineQueue: { enabled: boolean; retryMs: number[] };
}
export const defaultConfig: NuresqConfig = {
  mode: "AUTO", assistantModel: "AUTO", backendUrl: "http://127.0.0.1:8787", backendHealthTimeoutMs: 2500, assistantTimeoutMs: 22000, healthPollMs: 25000,
  localAI: { enabled: true, runtime: "GGUF_SERVER", serverUrl: "http://127.0.0.1:8790", modelPath: "./models/SmolLM2-135M-Instruct-Q3_K_M.gguf", version: "smollm2-135m-q3km-v1", classificationThreshold: 0.72, guideThreshold: 0.65, inferenceTimeoutMs: 3500, loadTimeoutMs: 20000 },
  offlineQueue: { enabled: true, retryMs: [5000, 15000, 30000, 60000, 120000] },
};
declare global { interface Window { __NURESQ_CONFIG__?: Partial<NuresqConfig> } }
export function getConfig(): NuresqConfig {
  const override = typeof window === "undefined" ? {} : window.__NURESQ_CONFIG__ ?? {};
  const cfg = { ...defaultConfig, ...override, localAI: { ...defaultConfig.localAI, ...override.localAI }, offlineQueue: { ...defaultConfig.offlineQueue, ...override.offlineQueue } };
  if (!["AUTO", "FORCE_OFFLINE", "FORCE_ONLINE"].includes(cfg.mode)) cfg.mode = "AUTO";
  if (!["AUTO", "LOCAL", "GEMINI"].includes(cfg.assistantModel)) cfg.assistantModel = "AUTO";
  cfg.backendUrl = cfg.backendUrl.replace(/\/$/, "");
  return cfg;
}

const ASSISTANT_MODEL_KEY = "nuresq-assistant-model";
export type AssistantModelPreference = NuresqConfig["assistantModel"];
export function getAssistantModelPreference(): AssistantModelPreference {
  if (typeof window === "undefined") return "AUTO";
  const value = window.localStorage.getItem(ASSISTANT_MODEL_KEY);
  return value === "LOCAL" || value === "GEMINI" || value === "AUTO" ? value : "AUTO";
}
export function setAssistantModelPreference(value: AssistantModelPreference) {
  if (typeof window !== "undefined") window.localStorage.setItem(ASSISTANT_MODEL_KEY, value);
}
