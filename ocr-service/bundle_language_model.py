"""Download a pinned official Qwen3 GGUF during build, never on user requests."""
from pathlib import Path
import urllib.request

root = Path("/opt/language-model")
root.mkdir(parents=True, exist_ok=True)
name = "Qwen3-8B-Q4_K_M.gguf"
revision = "7c41481f57cb95916b40956ab2f0b139b296d974"
base = f"https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/{revision}"
with urllib.request.urlopen(f"{base}/{name}", timeout=120) as response, (root / name).open("wb") as output:
    import shutil
    shutil.copyfileobj(response, output)
if (root / name).stat().st_size < 5_000_000_000:
    raise RuntimeError("Incomplete local language model download")
