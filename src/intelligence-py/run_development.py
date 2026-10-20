"""Run FastAPI locally with settings loaded from src/intelligence-py/.env."""
import os
from pathlib import Path
import uvicorn

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

def load_local_env(path: Path) -> None:
    if not path.is_file():
        raise RuntimeError(f"Missing development environment file: {path}")
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key.strip():
            raise ValueError("Invalid environment entry")
        value = value.strip().strip('"').strip("'")
        os.environ[key.strip()] = value

if __name__ == "__main__":
    load_local_env(ENV_PATH)
    os.chdir(ROOT)
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
