# PaddleOCR bundled deployment

The root Dockerfile builds the website and a CPU PaddleOCR service into one image.
The Thai recognition and mobile detection models are downloaded at build time and copied to
/opt/ocr-models. Runtime initializes explicit local model paths.

## Coolify

Change the existing application's build pack from Static to Dockerfile.
Use /Dockerfile and expose port 8080. Deploy the same existing domain.
Build requires access to Python packages and PaddleOCR model downloads.
This replaces the static runtime with nginx and one Python OCR worker.
CPU and memory consumption will increase and must be checked during rollout.

POST /ocr accepts multipart fileA from the image-check mode or the existing n8n JSON contract:

    {"base64": "<base64 image or PDF, optional data URI prefix>"}

The response includes text and words with confidence, page, x/y/w/h and four-point box.
PaddleOCR regions may be entire lines rather than individual words.
GET /ocr/health reports readiness after model initialization.

Image mode calls /ocr on the same origin, then /proofread for contextual spelling.
Browser OCR supplies an independent character reading for checking apparent OCR
errors. PaddleOCR character bounds come from recognizer CTC alignment inside
detection polygons. These bounds are approximate; a full-line box is never used
as a substitute for a missing word box. When PaddleOCR is unavailable, the legacy
n8n image path remains a fallback. Text and comparison modes retain their existing
services. The localhost local-ocr=1 link is only a dictionary preview.

## Validation

Python syntax and shell syntax can be checked locally. Build and smoke-test the
Linux image before switching production:

    docker build -t hoo-hoo-paddle .
    docker run --rm -p 8080:8080 hoo-hoo-paddle

The local model test uses OCR_MODEL_ROOT pointing to existing PaddleOCR models.
The deployment image runs the same configuration but bundles downloaded models.

The PaddleOCR container check workflow builds the Linux image and checks startup,
static assets and real OCR inference with networking disabled at runtime.

## Contextual proofreading of new work

Image mode now sends literal PaddleOCR regions to POST /proofread in batches of
at most six. The gateway audits spelling from context, independently of the
frontend typo dictionary. Each response must account for every input region,
including correct text. Missing or invalid regions are retried once in smaller
batches. Incomplete coverage remains visibly incomplete. Corrections retain their
source region IDs and use real OCR character boxes; identical text elsewhere is
not automatically marked.

Set the runtime environment variable PROOFREAD_API_KEY in Coolify using the same
LLM gateway credential already used by the n8n workflow. Never add it to a build
argument, the frontend, this repository, or an image layer. Redeploy after saving.
Defaults: PROOFREAD_API_URL=https://llm-gateway.tks.co.th/v1/chat/completions,
PROOFREAD_MODEL=DeepSeek-V4-Flash-0731. These two settings are optional.
GET /proofread/health exposes only whether the key is configured, never the key.
Without the runtime key the model endpoint returns 503; it does not claim a clean
result. PaddleOCR and the service health endpoint remain independent of model
configuration. The spelling gateway receives OCR text; user images stay at /ocr.

The model may still miss typos or be misled by OCR errors. The synthetic benchmark
is an integration check, not a guarantee for every document, font or domain.
