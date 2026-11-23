"""Bundle the pinned OpenThai release; runtime never downloads model files."""
import urllib.request
from model_config import MODEL_ROOT, create_ocr

MODEL_ID = "iapp/OpenThai2.1-OCR-Text-20261118"
REVISION = "v2.1.4"
MODEL_ROOT.mkdir(parents=True, exist_ok=True)
for name in ("det.onnx", "rec.onnx", "rec2.onnx", "rec_dict.txt", "config.json", "det.yml"):
    urllib.request.urlretrieve(
        f"https://huggingface.co/{MODEL_ID}/resolve/{REVISION}/{name}",
        MODEL_ROOT / name,
    )
create_ocr()
