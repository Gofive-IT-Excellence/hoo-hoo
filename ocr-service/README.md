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

The image-check mode calls /ocr on the same origin and sends PaddleOCR regions
in the existing browserOCR field to n8n. Browser OCR supplies character positions for word-level strike marks. When
needed, PaddleOCR character bounds come from recognizer CTC alignment within
detection polygons. These bounds are approximate; a full-line box is never used
as a substitute for a missing word box. If PaddleOCR is unavailable, browser
OCR supplies the workflow payload. The localhost local-ocr=1 test link uses the
browser spelling fallback, while the normal image-check flow sends to n8n.
The spelling model remains in the existing workflow.

## Validation

Python syntax and shell syntax can be checked locally. Build and smoke-test the
Linux image before switching production:

    docker build -t hoo-hoo-paddle .
    docker run --rm -p 8080:8080 hoo-hoo-paddle

The local model test uses OCR_MODEL_ROOT pointing to existing PaddleOCR models.
The deployment image runs the same configuration but bundles downloaded models.

The PaddleOCR container check workflow builds the Linux image and checks startup,
static assets and real OCR inference with networking disabled at runtime.
