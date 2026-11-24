"""AksonOCR-Lite for document mode, with local weights and bounded CPU use."""
import os
import threading
from pathlib import Path

MODEL_ID = 'Remtir/AksonOCR-Lite'
MODEL_REVISION = '576fa7b148b628656eb6fb70917d3e8c488bab3d'
CODE_REVISION = '8f1f3d87d41e2b585354950767b9a9be678e0352'
MODEL_ROOT = Path(os.environ.get('AKSONOCR_WEIGHTS', '/opt/akson-models'))
MAX_DOCUMENT_PAGES = 20
MODEL_FILES = ('layout.onnx', 'det.onnx', 'doc_ori.onnx', 'textline_ori.onnx',
               'rec.onnx', 'rec_charset.json', 'tatr.onnx', 'config.json', 'LICENSE', 'NOTICE')


class DocumentOCR:
    def __init__(self, converter=None):
        if converter is None:
            import aksonocr_lite
            os.environ['AKSONOCR_WEIGHTS'] = str(MODEL_ROOT)
            os.environ.setdefault('AKSONOCR_THREADS', '2')
            converter = aksonocr_lite.load(device='cpu', small_device='cpu', dpi=150,
                                          dewarp=False, tables=True)
        self.converter = converter
        self.lock = threading.Lock()

    def read_lines(self, data):
        import pypdfium2 as pdfium
        data = data.lstrip() if data.lstrip().startswith(b'%PDF') else data
        if data.startswith(b'%PDF'):
            with pdfium.PdfDocument(data) as document:
                if len(document) > MAX_DOCUMENT_PAGES:
                    raise ValueError('กรุณาแบ่ง PDF ให้ไม่เกิน 20 หน้าต่อครั้ง')
        result = []
        with self.lock:
            for page in self.converter.convert(data, max_pages=MAX_DOCUMENT_PAGES):
                # Blocks retain reading order, including headers and text in tables.
                # Use literal OCR text, never generated Markdown/HTML, for spelling.
                seen = set()
                for block in sorted(page.blocks, key=lambda block: block.order):
                    for index in block.line_ids:
                        if index not in seen and 0 <= index < len(page.lines):
                            result.append(page.lines[index].text)
                            seen.add(index)
                # Layout classification must not discard unassigned/footer text.
                for index, line in enumerate(page.lines):
                    if index not in seen:
                        result.append(line.text)
        return result

    def read_words(self, data):
        return [{'text': text} for text in self.read_lines(data)]
