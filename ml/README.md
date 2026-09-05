# Model development only

Create a Python venv. Install CPU torch, transformers<5, onnx, onnxruntime, numpy. Run `python ml/export_to_onnx.py`, then `python ml/evaluate_model.py` from SOURCE-CODE. Internet is needed for export, not citizen inference. No GPU needed.

The upstream IndoBERT-Lite encoder is genuine pretrained Indonesian ALBERT. It has no emergency classification head. We use normalized mean embeddings and authored, synthetic label prototypes; cosine similarity is a confidence score, NOT a calibrated probability. No production accuracy is claimed. Evaluation phrases are small authored development examples, not a training corpus. A future labelled dataset should use `{ "text": "...", "incident_type": "FLOOD", "source": "human-reviewed" }`, split by author/event, and report per-class confusion and calibration before operational deployment.

Export requires output `embedding`, WordPiece tokenizer.json, prototypes.json and guide-embeddings.json. The manifest is only marked installed after export succeeds, with SHA-256. If assets are absent, application reports MODEL_NOT_INSTALLED / rule fallback. Browser READY requires creating an actual WASM session and a successful warmup.

Respect upstream MIT license and retain attribution. The large development dependencies and unquantized ONNX are excluded from the final ZIP. Model replacement must increment manifest/config version. Re-run evaluation and browser offline tests.
