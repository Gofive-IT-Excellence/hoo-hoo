# Bundled OCR and local proofreading

The Dockerfile packages nginx, OpenThai OCR Text 2.1.4 and a local Qwen3 8B
spelling model served by llama.cpp. See [SELF_HOSTED.md](SELF_HOSTED.md) for pinned
versions, resource requirements and inference isolation.

## Coolify

Use the existing application's Dockerfile strategy, `/Dockerfile`, base directory
`/` and exposed port `8080`. Keep the existing domain. Model weights are included
at build time. No runtime Gateway key or remote model URL is used for spelling
checks. Existing Gateway environment variables are ignored.

## Endpoints

- `POST /ocr`: multipart `fileA`, or JSON `base64` image/PDF. Returns text and
  regions with confidence, page, polygon and CTC character positions.
- `POST /document/text`: multipart `fileA` for TXT, DOCX, DOC, PDF or images.
  Extraction runs locally; scanned PDF pages use OCR.
- `POST /proofread`: JSON `lines` with original integer IDs and literal text.
  Returns spelling suggestions and explicit unchecked IDs. The model endpoint
  is fixed to loopback; there is no fallback to the old shared Gateway.
- `GET /ocr/health`: healthy only after OCR and the language model are ready.
- `GET /proofread/health`: actual local model name and readiness.

The browser sends up to three regions and about 450 characters per batch, with
one batch in flight. A single longer region is retained. Missing coverage is
retried once. Busy responses back off before retrying. Invalid large rewrites
remain unchecked; correct function words and existing Thai combining marks are
protected. Suggestions retain source IDs and character boxes for occurrence
placement. Character bounds are approximate; missing word boxes are not replaced
with an entire line. The independent browser OCR remains available for checking
apparent OCR errors.

The separate chat assistant retains its n8n integration. Document comparison
runs in the browser. Neither path is changed into a spelling audit.

## Validation

Run `npm test` and `python3 -m unittest discover -s ocr-service -p 'test_*.py'`
(with NumPy installed). The container workflow builds Linux CPU inference and
runs OCR and language model smoke tests with `--network none` using generated
test data. Model quality benchmarks are small integration checks, not guarantees
for every document, font or domain.
