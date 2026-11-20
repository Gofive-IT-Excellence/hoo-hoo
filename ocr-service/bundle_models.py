"""Download models during image build, then validate the explicit local paths."""
import shutil
from pathlib import Path

from paddleocr import PaddleOCR

from model_config import MODEL_ROOT, create_ocr

PaddleOCR(
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="th_PP-OCRv5_mobile_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    device="cpu",
)
MODEL_ROOT.mkdir(parents=True, exist_ok=True)
for name in ("PP-OCRv5_mobile_det", "th_PP-OCRv5_mobile_rec"):
    shutil.copytree(
        Path.home() / ".paddlex" / "official_models" / name,
        MODEL_ROOT / name,
        dirs_exist_ok=True,
    )
create_ocr()
