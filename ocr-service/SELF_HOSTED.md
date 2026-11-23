# Local spelling audits

HOO HOO sends proofreading text to llama.cpp at `127.0.0.1:5056` in the
application container. It does not use `PROOFREAD_API_KEY`, `PROOFREAD_API_URL`
or `PROOFREAD_MODEL`; old Gateway settings are ignored. The inference port is
not exposed by nginx or Docker. Image OCR remains OpenThai Text 2.1.4.

The model is the official `Qwen/Qwen3-8B-GGUF`, `Q4_K_M`, pinned to
`7c41481f57cb95916b40956ab2f0b139b296d974` (Apache-2.0).
llama.cpp is pinned to `7fe450e19305b828c199d602c23a8337aaa1f03b` (MIT).
Weights are downloaded during the Docker build, not while processing documents.
Startup and inference work without network access after building the image.

Generation uses four CPU threads, one slot and an 8192-token context. The browser
submits one batch at a time; the backend serializes model requests. Allow roughly
8 GB of available RAM for the application and model and at least 12 GB of spare
disk for building. CPU inference is slower than a remote GPU-backed service.

The website routes image and document spelling audits through local endpoints.
The separate conversational assistant (`hoohoo-chat`) retains its existing n8n
integration; it is not part of the spelling audit.

`/proofread/health` exposes the actual model and readiness. `/ocr/health` only
reports healthy when both OCR and the local language service are ready. A model
failure never falls back to the old Gateway; missing line coverage remains
unchecked. The offline container CI test exercises both OCR and language
inference using generated text and images, never customer documents.

Model output is a spelling suggestion, not guaranteed truth. Existing guards
preserve valid Thai function words, reject partial combining-mark matches and
ignore whitespace-only edits. Large text rewrites remain unchecked. Evaluate
new models on held-out errors and correct controls before deployment.
