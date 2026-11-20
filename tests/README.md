# Proofreading checks

`npm ci && npm test` checks batching, explicit coverage, bounded retries,
cancellation, novel model corrections and occurrence-specific coordinates.
`python3 -m unittest discover -s ocr-service -p 'test_*.py'` checks the model
response contract without credentials or network calls.

Optional live benchmark (explicitly calls the configured model):

1. Run the OCR service with PROOFREAD_API_KEY set in its environment.
2. Supply a Python with Pillow and a font that supports Thai:

   HOOHOO_TEST_BASE_URL=http://127.0.0.1:5059 HOOHOO_TEST_PYTHON=python3 HOOHOO_TEST_FONT=/path/to/ThaiFont.ttf node tests/live-new-work.cjs

The benchmark creates a synthetic 12-line image from fixtures/new-work.json.
Eight misspellings are outside the app's known-typo rules; four lines are correct.
It runs OCR, contextual auditing, result rendering and word placement, then
checks detection, false positives, coverage and placement. No user documents or
credentials are included in the fixture. Results are written to an OS temp dir.
