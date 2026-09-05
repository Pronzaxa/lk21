export interface NuresqConfig {
  mode: "AUTO" | "FORCE_OFFLINE" | "FORCE_ONLINE";
  backendUrl: string;
  backendHealthTimeoutMs: number;
  healthPollMs: number;
  localAI: { enabled: boolean; runtime: "GGUF_SERVER" | "ONNX_WEB"; serverUrl: string; modelPath: string; version: string; classificationThreshold: number; guideThreshold: number; inferenceTimeoutMs: number; loadTimeoutMs: number };
  offlineQueue: { enabled: boolean; retryMs: number[] };
}
export const defaultConfig: NuresqConfig = {
  mode: "AUTO", backendUrl: "http://127.0.0.1:8787", backendHealthTimeoutMs: 2500, healthPollMs: 25000,
  localAI: { enabled: true, runtime: "GGUF_SERVER", serverUrl: "http://127.0.0.1:8790", modelPath: "./models/SmolLM2-135M-Instruct-Q3_K_M.gguf", version: "smollm2-135m-q3km-v1", classificationThreshold: 0.72, guideThreshold: 0.65, inferenceTimeoutMs: 3500, loadTimeoutMs: 20000 },
  offlineQueue: { enabled: true, retryMs: [5000, 15000, 30000, 60000, 120000] },
};
declare global { interface Window { __NURESQ_CONFIG__?: Partial<NuresqConfig> } }
export function getConfig(): NuresqConfig {
  const override = typeof window === "undefined" ? {} : window.__NURESQ_CONFIG__ ?? {};
  const cfg = { ...defaultConfig, ...override, localAI: { ...defaultConfig.localAI, ...override.localAI }, offlineQueue: { ...defaultConfig.offlineQueue, ...override.offlineQueue } };
  if (!["AUTO", "FORCE_OFFLINE", "FORCE_ONLINE"].includes(cfg.mode)) cfg.mode = "AUTO";
  cfg.backendUrl = cfg.backendUrl.replace(/\/$/, "");
  return cfg;
}
