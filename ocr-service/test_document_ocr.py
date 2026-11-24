import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from document_ocr import DocumentOCR
from document_text import text_lines


class DocumentOCRTests(unittest.TestCase):
    def test_reading_order_keeps_table_headers_and_unassigned_lines_once(self):
        page = SimpleNamespace(
            lines=[SimpleNamespace(text=t) for t in ['หัวเรื่อง', 'ตาราง 100', 'ท้ายหน้า', 'ข้อความ']],
            blocks=[SimpleNamespace(order=2, line_ids=[1, 1]),
                    SimpleNamespace(order=1, line_ids=[0, 3])])
        converter = SimpleNamespace(convert=lambda data, max_pages: iter([page, page]))
        with patch.dict(sys.modules, {'pypdfium2': SimpleNamespace()}):
            lines = DocumentOCR(converter).read_lines(b'image')
        self.assertEqual(lines, ['หัวเรื่อง', 'ข้อความ', 'ตาราง 100', 'ท้ายหน้า'] * 2)

    def test_pdf_limit_rejects_whole_document_instead_of_silently_truncating(self):
        class PDF:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def __len__(self): return 21
        converter = SimpleNamespace(convert=lambda *args, **kwargs: self.fail('must reject before inference'))
        with patch.dict(sys.modules, {'pypdfium2': SimpleNamespace(PdfDocument=lambda data: PDF())}):
            with self.assertRaisesRegex(ValueError, '20'):
                DocumentOCR(converter).read_lines(b'%PDF test')

    def test_document_pdf_uses_akson_and_typed_text_remains_literal(self):
        calls = []
        def read_pdf(data):
            calls.append(data)
            return ['หน้าหนึ่ง', 'หน้าสอง']
        self.assertEqual(text_lines(b'%PDF test', 'scan.pdf', read_pdf, None), ['หน้าหนึ่ง', 'หน้าสอง'])
        self.assertEqual(calls, [b'%PDF test'])
        self.assertEqual(text_lines('ได้ อื่นๆ'.encode(), 'typed.txt', None, None), ['ได้ อื่นๆ'])
