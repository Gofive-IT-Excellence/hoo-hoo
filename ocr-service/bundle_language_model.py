"""Download a pinned official Qwen3 GGUF during build, never on user requests."""
from pathlib import Path
import urllib.request
import hashlib

root = Path("/opt/language-model")
root.mkdir(parents=True, exist_ok=True)
name = "Qwen3-8B-Q4_K_M.gguf"
revision = "7c41481f57cb95916b40956ab2f0b139b296d974"
base = f"https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/{revision}"
expected_sha256 = "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785"
digest = hashlib.sha256()
with urllib.request.urlopen(f"{base}/{name}", timeout=120) as response, (root / name).open("wb") as output:
    while block := response.read(1024 * 1024):
        digest.update(block)
        output.write(block)
if digest.hexdigest() != expected_sha256:
    raise RuntimeError("Local language model checksum mismatch")
