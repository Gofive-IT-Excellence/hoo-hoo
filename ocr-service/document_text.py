"""Extract local document text without sending uploads to an external service."""
from pathlib import Path
import io
import zipfile
from xml.etree import ElementTree


def text_lines(data, filename, pdf_reader, image_reader):
    suffix = Path(filename).suffix.lower()
    if data.lstrip().startswith(b'%PDF'):
        return pdf_reader(data)
    if suffix == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo('word/document.xml')
            if info.file_size > 10_000_000:
                raise ValueError('เอกสาร Word ใหญ่เกินกำหนด กรุณาแบ่งไฟล์')
            root = ElementTree.fromstring(archive.read(info))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        return [''.join(p.itertext()) for p in root.findall('.//w:p', ns)]
    if suffix == '.txt':
        encoding = 'utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
        return data.decode(encoding).splitlines()
    if suffix == '.doc':
        raise ValueError('กรุณาบันทึกไฟล์ .doc เป็น .docx หรือ PDF ก่อนส่งตรวจ')
    return [w['text'] for w in image_reader(data)]


def pack_lines(lines):
    result = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Preserve literal text; split only at whitespace for long paragraphs.
        while len(line) > 800:
            stop = line.rfind(' ', 0, 800)
            stop = stop if stop > 0 else 800
            result.append(line[:stop]); line = line[stop:].lstrip()
        if line:
            result.append(line)
    if not result:
        raise ValueError('ไม่พบข้อความที่อ่านได้ในเอกสาร')
    if len(result) > 300 or sum(map(len, result)) > 50000:
        raise ValueError('เอกสารยาวเกินกำหนด กรุณาแบ่งไฟล์แล้วส่งตรวจใหม่')
    return {'text': '\n'.join(result), 'regions': [{'text': t, 'bbox': [0,0,1000,1000]} for t in result]}
