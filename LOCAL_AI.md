# Local AI — SmolLM2 GGUF

Runtime aktif sekarang adalah `GGUF_SERVER`, memakai `public/models/SmolLM2-135M-Instruct-Q3_K_M.gguf` milik pengguna. Ukuran 93,510,496 byte; SHA-256 `0B431BE309B25C9496463B3362D89A7156C44CDD899EE64F1390F11A059188EF`. Runtime memakai `llama-cpp-python` CPU pada `127.0.0.1:8790`.

SmolLM2 adalah instruction/generative model, bukan encoder embedding. Adapter `local-ai/gguf_server.py` meminta JSON NLU terstruktur. Hasilnya hanya kandidat pemahaman; parser deterministik dan Safety Core tetap menentukan fakta eksplisit, negasi, risiko, serta keputusan SOS. Model tidak menetapkan prioritas.

Health check yang benar adalah `http://127.0.0.1:8790/health` dan harus menyebut `runtime: llama-cpp-python`, model yang tepat, serta `model_exists: true`. UI hanya menampilkan “Siap digunakan” setelah health check berhasil; jika server mati, UI turun ke parser dasar.

States: UNAVAILABLE (including file:// restrictions), MODEL_NOT_INSTALLED, LOADING, READY (session + warmup succeeded), FAILED, RULE_FALLBACK (disabled). No module-presence readiness.

Pasang dependency dengan `.\.ml-venv\Scripts\python.exe -m pip install -r local-ai\requirements.txt`, lalu jalankan `local-ai\START-SMOLLM2-WINDOWS.cmd`. GGUF tidak bisa dijalankan langsung oleh `onnxruntime-web` atau `file://`; membuka HTML tetap menggunakan parser dasar.

To re-export: see ml/README.md. Upstream uses BertTokenizer despite ALBERT architecture; AutoTokenizer chooses the wrong tokenizer on this older checkpoint. Our exporter uses BertTokenizerFast per upstream instructions and saves its WordPiece vocabulary. No model was downloaded again after the user supplied their checkpoint.
