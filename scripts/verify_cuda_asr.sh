#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.cuda.yml)

echo "== Host GPU =="
nvidia-smi --query-gpu=name,driver_version,cuda_version,memory.total --format=csv,noheader

echo
echo "== Docker runtimes =="
docker info --format '{{json .Runtimes}} default={{json .DefaultRuntime}}'

echo
echo "== Docker GPU probe =="
if ! docker run --rm --gpus all alpine:3.21 true >/dev/null 2>&1; then
  echo "Docker still cannot access the NVIDIA GPU." >&2
  echo "Install NVIDIA Container Toolkit, run 'sudo nvidia-ctk runtime configure --runtime=docker', and restart Docker." >&2
  exit 1
fi
echo "Docker GPU access is available."

echo
echo "== Current ASR env =="
grep -E '^(ASR_DEVICE|ASR_COMPUTE_TYPE|ASR_MODEL_NAME)=' .env || true

if ! grep -q '^ASR_DEVICE=cuda$' .env; then
  echo "Updating .env to use CUDA for ASR."
  if grep -q '^ASR_DEVICE=' .env; then
    sed -i 's/^ASR_DEVICE=.*/ASR_DEVICE=cuda/' .env
  else
    echo 'ASR_DEVICE=cuda' >> .env
  fi
fi

if ! grep -q '^ASR_COMPUTE_TYPE=float16$' .env; then
  echo "Updating .env to use float16 for CUDA ASR."
  if grep -q '^ASR_COMPUTE_TYPE=' .env; then
    sed -i 's/^ASR_COMPUTE_TYPE=.*/ASR_COMPUTE_TYPE=float16/' .env
  else
    echo 'ASR_COMPUTE_TYPE=float16' >> .env
  fi
fi

echo
echo "== Starting CUDA backend =="
docker compose "${COMPOSE_FILES[@]}" up --build -d backend

echo
echo "== CTranslate2 CUDA check =="
docker compose "${COMPOSE_FILES[@]}" exec -T backend python - <<'PY'
import ctranslate2
from app.core.config import get_settings

settings = get_settings()
print("ASR_DEVICE", settings.asr_device)
print("ASR_COMPUTE_TYPE", settings.asr_compute_type)
print("ASR_MODEL_NAME", settings.asr_model_name)
print("CUDA_DEVICE_COUNT", ctranslate2.get_cuda_device_count())
print(
    "CUDA_COMPUTE_TYPES",
    sorted(getattr(item, "value", str(item)) for item in ctranslate2.get_supported_compute_types("cuda")),
)
PY

echo
echo "== GPU transcription probe =="
docker compose "${COMPOSE_FILES[@]}" exec -T backend bash -lc '
set -euo pipefail
ffmpeg -y -f lavfi -i "flite=text=hello this is a trace itself gpu test:voice=slt" -ar 16000 -ac 1 /tmp/trace_gpu_probe.wav >/tmp/trace_gpu_probe_ffmpeg.log 2>&1
python - <<'"'"'PY'"'"'
from pathlib import Path
from app.core.config import get_settings
from app.services.asr import service

settings = get_settings()
result = service.transcribe_file(Path("/tmp/trace_gpu_probe.wav"), model_name=settings.asr_model_name, language="en")
print("TRANSCRIPT_LANGUAGE", result.language)
print("TRANSCRIPT_DURATION", result.duration_seconds)
print("TRANSCRIPT_TEXT", result.text)
print("TRANSCRIPT_MODEL", result.model_name)
PY
'

echo
echo "CUDA ASR verification passed."
