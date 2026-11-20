#!/bin/bash
set -eu
cd /app/ocr-service
gunicorn --bind 127.0.0.1:5055 --workers 1 --threads 1 --timeout 180 --access-logfile - --error-logfile - server:app &
ocr_pid=$!
nginx -g 'daemon off;' &
web_pid=$!
trap 'kill "$ocr_pid" "$web_pid" 2>/dev/null || true' EXIT TERM INT
wait -n "$ocr_pid" "$web_pid"
