from flask import Flask, request, jsonify
from model_config import create_ocr
from document_ocr import DocumentOCR, MODEL_REVISION as DOCUMENT_MODEL_REVISION
from PIL import Image
import pypdfium2 as pdfium
import base64
import tempfile
import os
import traceback
import io
import threading
from proofreading import configured, proofread, validate_lines, LOCAL_MODEL, ModelBusy

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
ocr = create_ocr()
ocr_lock = threading.Lock()
document_ocr = DocumentOCR()

@app.get("/health")
def health():
    ready = configured()
    return jsonify({"status": "ok" if ready else "loading", "engine": "openthai-ocr-text",
                    "version": "2.1.4", "language": "th", "proofreading_ready": ready,
                    "document_engine": "aksonocr-lite", "document_model_revision": DOCUMENT_MODEL_REVISION}), 200 if ready else 503


@app.get("/proofread/health")
def proofreading_health():
    return jsonify({"configured": configured(), "engine": "local-llama.cpp", "model": LOCAL_MODEL})


@app.post("/proofread")
def run_proofreading():
    if not configured():
        return jsonify({"error": "Proofreading model is not configured"}), 503
    data = request.get_json(silent=True) or {}
    try:
        lines = validate_lines(data.get("lines"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    try:
        return jsonify(proofread(lines))
    except ModelBusy:
        return jsonify({"error": "บริการกำลังตรวจเอกสารอีกชุด กรุณารอสักครู่"}), 429, {"Retry-After": "5"}
    except RuntimeError:
        app.logger.warning("Contextual proofreading request failed")
        return jsonify({"error": "Proofreading service did not complete the audit"}), 502


MAX_PDF_PAGES = 50
PDF_RENDER_SCALE = 2.0


def extract_words(result, page_number=1):
    words = []

    for line in result.get("lines", []):
        text = line.get("text", "")
        box = line.get("box")
        if not text or not box:
            continue
        box = [[float(x), float(y)] for x, y in box]
        xs, ys = zip(*box)
        words.append({
            "text": text, "characters": line.get("characters", []),
            "confidence": float(line.get("confidence", 0)),
            "x": min(xs), "y": min(ys), "w": max(xs)-min(xs), "h": max(ys)-min(ys),
            "box": box, "page": page_number,
        })

    return words


def run_image_ocr(image_bytes):
    image_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
            f.write(image_bytes)
            image_path = f.name

        with ocr_lock:
            return extract_words(ocr.read(image_path))
    finally:
        if image_path and os.path.exists(image_path):
            os.remove(image_path)


def run_pdf_ocr(pdf_bytes):
    document = pdfium.PdfDocument(pdf_bytes)
    page_count = len(document)

    if page_count > MAX_PDF_PAGES:
        raise ValueError(
            f"PDF has {page_count} pages; maximum is {MAX_PDF_PAGES} pages"
        )

    pages = []
    words = []

    for page_index in range(page_count):
        page = document[page_index]
        bitmap = page.render(scale=PDF_RENDER_SCALE)
        image = bitmap.to_pil().convert("RGB")
        image_path = None

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
                image.save(f, format="PNG")
                image_path = f.name

            with ocr_lock:
                page_words = extract_words(
                    ocr.read(image_path),
                    page_number=page_index + 1
                )
            page_text = " ".join(word["text"] for word in page_words)

            pages.append({
                "page": page_index + 1,
                "text": page_text,
                "words": page_words,
                "width": image.width,
                "height": image.height
            })
            words.extend(page_words)
        finally:
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
            page.close()

    document.close()
    return words, pages


@app.get("/document/health")
def document_health():
    return jsonify({"status": "ok", "engine": "aksonocr-lite", "device": "cpu",
                    "model_revision": DOCUMENT_MODEL_REVISION})


@app.post("/document/text")
def extract_document_text():
    from document_text import text_lines, pack_lines
    upload = request.files.get("fileA")
    if not upload:
        return jsonify({"error": "missing fileA"}), 400
    try:
        data = upload.read()
        result = pack_lines(text_lines(data, upload.filename or "",
                                       document_ocr.read_lines, document_ocr.read_words))
        native = not data.lstrip().startswith(b"%PDF") and (upload.filename or "").lower().endswith((".doc", ".docx", ".txt"))
        result["engine"] = "native-text" if native else "aksonocr-lite"
        return jsonify(result)
    except (ValueError, UnicodeError, KeyError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Document text extraction failed")
        return jsonify({"error": "อ่านข้อความจากเอกสารไม่สำเร็จ"}), 422


@app.route("/ocr", methods=["POST"])
def run_ocr():
    try:
        upload = request.files.get("fileA")
        if upload:
            image_bytes = upload.read()
        else:
            data = request.get_json(silent=True) or {}
            image_base64 = data.get("base64", "")
            if not isinstance(image_base64, str) or not image_base64:
                return jsonify({"error": "missing fileA or base64"}), 400
            if "," in image_base64:
                image_base64 = image_base64.split(",", 1)[1]
            image_bytes = base64.b64decode(image_base64.strip(), validate=True)
        if not image_bytes:
            return jsonify({"error": "empty file"}), 400

        is_pdf = image_bytes.lstrip().startswith(b"%PDF")
        pages = []
        width = height = None

        if is_pdf:
            words, pages = run_pdf_ocr(image_bytes)
        else:
            with Image.open(io.BytesIO(image_bytes)) as image:
                width, height = image.size
                if width * height > 20000000:
                    return jsonify({"error": "image exceeds 20 million pixels"}), 400
            words = run_image_ocr(image_bytes)

        return jsonify({
            "width": width,
            "height": height,
            "file_type": "pdf" if is_pdf else "image",
            "page_count": len(pages) if is_pdf else 1,
            "pages": pages,
            "text": " ".join(w["text"] for w in words),
            "words": words
        })

    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({
            "error": "OCR processing failed"
        }), 500

if __name__ == "__main__":
    app.run(
        host=os.environ.get("OCR_HOST", "127.0.0.1"),
        port=int(os.environ.get("OCR_PORT", "5055"))
    )
