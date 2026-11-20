from flask import Flask, request, jsonify
from model_config import create_ocr
from PIL import Image
import pypdfium2 as pdfium
import base64
import tempfile
import os
import traceback
import io

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
ocr = create_ocr()

@app.get("/health")
def health():
    return jsonify({"status": "ok", "engine": "paddleocr", "language": "th"})


MAX_PDF_PAGES = 50
PDF_RENDER_SCALE = 2.0


def extract_words(result, page_number=1):
    words = []

    for res in result:
        data = res.json if hasattr(res, "json") else res

        if "res" in data:
            data = data["res"]

        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        polys = data.get("rec_polys", data.get("dt_polys", []))

        for i, text in enumerate(texts):
            if not text:
                continue

            score = float(scores[i]) if i < len(scores) else 0
            poly = polys[i] if i < len(polys) else None

            if poly is None:
                continue

            box = [[float(p[0]), float(p[1])] for p in poly]
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]

            characters = []
            offset = 0
            line_characters = data.get("text_word", [])
            line_boxes = data.get("text_word_boxes", [])
            if i < len(line_characters) and i < len(line_boxes):
                for character, polygon in zip(line_characters[i], line_boxes[i]):
                    start = text.find(character, offset)
                    if start < 0:
                        continue
                    x0, y0, x1, y1 = map(float, polygon)
                    points = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
                    characters.append({"text": character, "start": start,
                                       "end": start + len(character), "box": points})
                    offset = start + len(character)

            words.append({
                "text": text,
                "characters": characters,
                "confidence": score,
                "x": min(xs),
                "y": min(ys),
                "w": max(xs) - min(xs),
                "h": max(ys) - min(ys),
                "box": box,
                "page": page_number
            })

    return words


def run_image_ocr(image_bytes):
    image_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as f:
            f.write(image_bytes)
            image_path = f.name

        return extract_words(ocr.predict(image_path, return_word_box=True))
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

            page_words = extract_words(
                ocr.predict(image_path, return_word_box=True),
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
