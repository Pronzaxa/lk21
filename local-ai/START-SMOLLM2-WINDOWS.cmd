@echo off
set "NURESQ_GGUF_MODEL=%~dp0..\public\models\SmolLM2-135M-Instruct-Q3_K_M.gguf"
set "NURESQ_LOCAL_AI_PORT=8790"
"%~dp0..\.ml-venv\Scripts\python.exe" "%~dp0gguf_server.py"
