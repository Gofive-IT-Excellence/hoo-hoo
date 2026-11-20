import os
from pathlib import Path

from paddleocr import PaddleOCR
from paddlex.inference.pipelines.ocr import pipeline
from character_boxes import character_boxes

MODEL_ROOT = Path(os.environ.get("OCR_MODEL_ROOT", "/opt/ocr-models"))


def create_ocr():
    pipeline.cal_ocr_word_box = character_boxes
    return PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_detection_model_dir=str(MODEL_ROOT / "PP-OCRv5_mobile_det"),
        text_recognition_model_name="th_PP-OCRv5_mobile_rec",
        text_recognition_model_dir=str(MODEL_ROOT / "th_PP-OCRv5_mobile_rec"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
        enable_mkldnn=False,
        cpu_threads=2,
    )
