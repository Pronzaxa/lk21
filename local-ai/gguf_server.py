"""Local SmolLM2 GGUF adapter for nuRESQ.

The model proposes a structured classification only. The browser's deterministic
Safety Core remains authoritative for risk, negation, injury and SOS decisions.
"""
from __future__ import annotations
import json, os, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL = Path(os.environ.get("NURESQ_GGUF_MODEL", Path(__file__).parent.parent / "public/models/SmolLM2-135M-Instruct-Q3_K_M.gguf"))
HOST = os.environ.get("NURESQ_LOCAL_AI_HOST", "127.0.0.1")
PORT = int(os.environ.get("NURESQ_LOCAL_AI_PORT", "8790"))
LABELS = {"banjir":"FLOOD", "gempa":"EARTHQUAKE", "kebakaran":"FIRE", "api":"FIRE", "longsor":"LANDSLIDE", "medis":"MEDICAL", "sesak":"MEDICAL", "pingsan":"MEDICAL", "terjebak":"TRAPPED", "kejebak":"TRAPPED"}
_llm = None

def load_model():
    global _llm
    if _llm is None:
        if not MODEL.is_file(): raise FileNotFoundError(str(MODEL))
        from llama_cpp import Llama
        _llm = Llama(model_path=str(MODEL), n_ctx=512, n_threads=max(1, (os.cpu_count() or 2) - 1), verbose=False)
    return _llm

def fallback(text: str):
    lowered = text.lower()
    found = next(((label, value) for label, value in LABELS.items() if re.search(r"\b" + re.escape(label) + r"\b", lowered)), (None, "OTHER"))
    return {"state":"READY", "classification":{"label":found[1],"confidence":0.45 if found[0] else 0.0,"source":"GGUF_LOCAL"},"guides":[]}

def analyze(text: str):
    prompt = f'''<|im_start|>system\nKamu adalah parser NLU darurat Bahasa Indonesia. Jawab HANYA JSON valid dengan skema {{"label":"FLOOD|EARTHQUAKE|FIRE|LANDSLIDE|MEDICAL|TRAPPED|OTHER","confidence":0.0,"facts":{{}}}}. Jangan memberi saran medis, jangan menentukan prioritas, dan jangan menganggap kata setelah "tidak/bukan/tanpa" sebagai kejadian.\n<|im_end|>\n<|im_start|>user\n{text[:2000]}\n<|im_end|>\n<|im_start|>assistant\n'''
    try:
        result = load_model().create_completion(prompt, max_tokens=80, temperature=0.0, top_p=0.1, stop=["<|im_end|>", "\n\n"])
        raw = result["choices"][0]["text"].strip()
        match = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(match.group(0)) if match else {}
        label = data.get("label") if data.get("label") in {"FLOOD","EARTHQUAKE","FIRE","LANDSLIDE","MEDICAL","TRAPPED","OTHER"} else "OTHER"
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
        # A tiny generative model may emit valid OTHER despite an explicit cue.
        # Preserve the local deterministic signal; this still cannot set safety priority.
        if label == "OTHER":
            guarded = fallback(text)
            if guarded["classification"]["label"] != "OTHER":
                return guarded
        return {"state":"READY", "classification":{"label":label,"confidence":confidence,"source":"GGUF_LOCAL"}, "guides":[], "facts":data.get("facts",{}) if isinstance(data.get("facts",{}),dict) else {}}
    except Exception:
        return fallback(text)

class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(encoded)
    def do_OPTIONS(self): self._send(204, {})
    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status":"ok", "runtime":"llama-cpp-python", "model":MODEL.name, "model_exists":MODEL.is_file()}); return
        self._send(404, {"error":"NOT_FOUND"})
    def do_POST(self):
        if self.path != "/analyze": self._send(404, {"error":"NOT_FOUND"}); return
        try:
            size = int(self.headers.get("Content-Length", "0"));
            if size > 8192: raise ValueError("PAYLOAD_TOO_LARGE")
            body = json.loads(self.rfile.read(size)); text = body.get("text")
            if not isinstance(text, str) or not text.strip(): raise ValueError("INVALID_TEXT")
            self._send(200, analyze(text))
        except Exception as error: self._send(400, {"error":str(error)})
    def log_message(self, *_): pass

if __name__ == "__main__":
    if not MODEL.is_file(): raise SystemExit(f"GGUF model not found: {MODEL}")
    print(f"[LOCAL AI] SmolLM2 GGUF ready on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
