# OCR dependencies

- Tesseract.js 7.0.0: https://github.com/naptha/tesseract.js (Apache-2.0)
- Tesseract.js-core: bundled matching runtime, Apache-2.0; see core/LICENSE
- Thai and English traineddata: https://github.com/tesseract-ocr/tessdata (Apache-2.0), copied from the existing Homebrew Tesseract language installation to use the same models as the tests.

Comparison recognition runs locally in a web worker. The new comparison route does not upload document images or extracted text to an OCR provider. Existing proofreading modes retain their n8n endpoints.
