# Proofreading checks

`npm ci && npm test` checks batching, explicit coverage, bounded retries,
cancellation, novel model corrections and occurrence-specific coordinates.
`python3 -m unittest discover -s ocr-service -p 'test_*.py'` checks the model
response contract without credentials or network calls.

Optional live benchmark (explicitly calls the configured model):

1. Run the bundled Docker service with OpenThai and the local Qwen model ready. No Gateway API key is used.
2. Supply a Python with Pillow and a font that supports Thai:

   HOOHOO_TEST_BASE_URL=http://127.0.0.1:8080 HOOHOO_TEST_PYTHON=python3 HOOHOO_TEST_FONT=/path/to/ThaiFont.ttf node tests/live-new-work.cjs

The benchmark creates a synthetic 12-line image from fixtures/new-work.json.
Eight misspellings are outside the app's known-typo rules; four lines are correct.
It runs OCR, contextual auditing, result rendering and word placement, then
checks detection, false positives, coverage and placement. No user documents or
credentials are included in the fixture. Results are written to an OS temp dir.


## OpenThai / Tesseract reference comparison

`HOOHOO_TEST_BASE_URL=http://127.0.0.1:8080 node tests/live-ocr-comparison.cjs`
creates a six-line synthetic image containing Goegle Vids, Nano Banano, literal
Latin Ws, and correct controls Google Vids, Nano Banana and Source Code.
Requires curl, Python/Pillow, a font (`HOOHOO_TEST_FONT`) and the Tesseract CLI
(`HOOHOO_TESSERACT`, English language data). Install the normal Node dependencies first.
This opt-in command calls `/ocr` once and audits OCR rows through `/proofread`.
Set `HOOHOO_BENCHMARK_OUTPUT` to preserve images, raw requests/responses, TSV,
rendered annotations and JSON metrics; otherwise an OS temporary directory is used.

Metrics include case-sensitive, whitespace-normalized OCR character errors,
missing rows, region-box IoU against rendered text bounds, explicit audit coverage,
visible suggestions and locations. The Tesseract CLI is a reference engine, not
an archived PaddleOCR production baseline. Its local timing is not comparable
with the remote OpenThai HTTP request. Six synthetic Latin lines are not a Thai
accuracy benchmark or evidence of production-wide improvement.

`HOOHOO_REPLAY_DIR=/path/to/saved/run` reuses saved OCR and model responses to test
annotation changes without generating new model answers. Replay output is labelled;
do not report it as a fresh live inference result. The actual poster's Thai ฟร!
can be OCR-transcribed as Ws/WS; a literal Latin Ws in this fixture is a correct
control and must not automatically be changed to ฟรี.
