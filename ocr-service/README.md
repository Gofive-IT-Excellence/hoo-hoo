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


## Document mode: AksonOCR-Lite

`POST /document/text` uses the self-hosted **Remtir/AksonOCR-Lite** CPU pipeline
for PDFs (including scanned PDFs) and uploaded images in document mode. The
existing image-proofreading mode continues to use OpenThai. Word (`.doc`, `.docx`)
and text files preserve their embedded text; they are not rasterized or rewritten
by OCR. Extracted literal lines are passed to the existing local Qwen proofreader.

The Docker build installs the official Akson code at
`8f1f3d87d41e2b585354950767b9a9be678e0352` and bundles model revision
`576fa7b148b628656eb6fb70917d3e8c488bab3d` under `/opt/akson-models`.
`AKSONOCR_WEIGHTS` selects this offline directory; `AKSONOCR_THREADS=2` bounds
CPU use. No upload is sent to aksonocr.com, and no Akson API key is required.
Model/code license and notices are retained by the package and bundled weights.

PDFs are limited to 20 pages per request, rejected before inference rather than
silently truncated. Detected lines are ordered by layout blocks, including table
text and otherwise unassigned headers/footers. Markdown/HTML formatting is not
submitted as spelling content. This integration does not imply a 99% accuracy
claim for the app or its spelling suggestions.

Readiness: `GET /document/health` reports `engine: aksonocr-lite`, `device: cpu`,
and the fixed model revision. `/document/text` responses identify `engine` as
`aksonocr-lite` or `native-text`. `/ocr/health` also identifies the document engine.

Validation: unit tests cover page limits, literal typed text, duplicate layout-line
references, tables and reading order. The container workflow additionally reads a
scanned two-page PDF through the HTTP endpoint with networking disabled.
