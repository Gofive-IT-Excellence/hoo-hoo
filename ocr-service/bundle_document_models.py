"""Download the pinned AksonOCR release at build time; validate offline startup."""
import urllib.request
from document_ocr import MODEL_ID, MODEL_REVISION, MODEL_ROOT, MODEL_FILES, DocumentOCR


def bundle():
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    for name in MODEL_FILES:
        target = MODEL_ROOT / name
        if not target.exists():
            temporary = target.with_suffix(target.suffix + '.part')
            print(f'Bundling AksonOCR {name}', flush=True)
            urllib.request.urlretrieve(
                f'https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{name}', temporary)
            temporary.replace(target)
    DocumentOCR()


if __name__ == '__main__':
    bundle()
