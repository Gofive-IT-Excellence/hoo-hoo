import os
from pathlib import Path
from openthai_runtime.line_engine import LineOCR

MODEL_ROOT = Path(os.environ.get("OCR_MODEL_ROOT", "/opt/ocr-models"))


def create_ocr():
    return LineOCR(MODEL_ROOT, threads=2, runtime={"backend": "onnxruntime"})
