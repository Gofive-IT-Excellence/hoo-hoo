import io
import unittest
import zipfile
from document_text import text_lines, pack_lines

class DocumentTextTests(unittest.TestCase):
    def test_docx_preserves_paragraphs_and_literal_characters(self):
        b = io.BytesIO()
        with zipfile.ZipFile(b, 'w') as z:
            z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ได้</w:t></w:r><w:r><w:t> สินเชื่อ</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(text_lines(b.getvalue(), 'test.docx', None, None), ['ได้ สินเชื่อ'])
    def test_utf16_and_empty_files(self):
        self.assertEqual(text_lines('ได้'.encode('utf-16'), 'test.txt', None, None), ['ได้'])
        with self.assertRaises(ValueError): pack_lines(['', '  '])
    def test_long_paragraph_is_split_without_losing_text(self):
        original = 'ก' * 1700
        r = pack_lines([original])
        self.assertEqual(''.join(row['text'] for row in r['regions']), original)
        self.assertTrue(all(len(row['text']) <= 800 for row in r['regions']))
