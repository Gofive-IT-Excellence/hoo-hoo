#!/bin/bash
set -eu
cd /app/ocr-service
llama-server --model /opt/language-model/Qwen3-8B-Q4_K_M.gguf --alias qwen3-8b --host 127.0.0.1 --port 5056 --ctx-size 8192 --parallel 1 --threads 4 --threads-batch 4 --gpu-layers 0 --jinja --no-webui &
model_pid=$!
gunicorn --bind 127.0.0.1:5055 --workers 1 --threads 2 --timeout 180 --access-logfile - --error-logfile - server:app &
ocr_pid=$!
nginx -g 'daemon off;' &
web_pid=$!
trap 'kill "$model_pid" "$ocr_pid" "$web_pid" 2>/dev/null || true' EXIT TERM INT
wait -n "$model_pid" "$ocr_pid" "$web_pid"
