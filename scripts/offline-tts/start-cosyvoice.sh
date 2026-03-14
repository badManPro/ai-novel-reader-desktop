#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${COSYVOICE_ENV_FILE:-$SCRIPT_DIR/cosyvoice.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

COSYVOICE_HOST="${COSYVOICE_HOST:-127.0.0.1}"
COSYVOICE_PORT="${COSYVOICE_PORT:-9880}"
COSYVOICE_PYTHON="${COSYVOICE_PYTHON:-python3}"
COSYVOICE_ENTRY="${COSYVOICE_ENTRY:-server.py}"
COSYVOICE_MODEL_DIR="${COSYVOICE_MODEL_DIR:-}"
COSYVOICE_EXTRA_ARGS="${COSYVOICE_EXTRA_ARGS:-}"

fail() {
  echo "[cosyvoice] $1" >&2
  exit 1
}

is_placeholder_path() {
  local value="$1"
  [[ -z "$value" || "$value" == "/absolute/path/to/"* || "$value" == "changeme" || "$value" == "TODO" ]]
}

if is_placeholder_path "$COSYVOICE_MODEL_DIR"; then
  fail "COSYVOICE_MODEL_DIR 未设置为真实目录。请编辑 $ENV_FILE，填入 CosyVoice 仓库/服务目录。"
fi

if [[ ! -d "$COSYVOICE_MODEL_DIR" ]]; then
  fail "COSYVOICE_MODEL_DIR 不存在：$COSYVOICE_MODEL_DIR"
fi

if [[ "$COSYVOICE_PYTHON" == "python3" && -x "$COSYVOICE_MODEL_DIR/.venv/bin/python" ]]; then
  COSYVOICE_PYTHON="$COSYVOICE_MODEL_DIR/.venv/bin/python"
fi

if ! command -v "$COSYVOICE_PYTHON" >/dev/null 2>&1 && [[ ! -x "$COSYVOICE_PYTHON" ]]; then
  fail "找不到 Python 解释器：$COSYVOICE_PYTHON"
fi

cd "$COSYVOICE_MODEL_DIR"

if [[ ! -f "$COSYVOICE_ENTRY" ]]; then
  fail "入口脚本不存在：$COSYVOICE_MODEL_DIR/$COSYVOICE_ENTRY"
fi

echo "[cosyvoice] using env: $ENV_FILE"
echo "[cosyvoice] python: $COSYVOICE_PYTHON"
echo "[cosyvoice] cwd: $COSYVOICE_MODEL_DIR"
echo "[cosyvoice] entry: $COSYVOICE_ENTRY"
echo "[cosyvoice] listen: http://$COSYVOICE_HOST:$COSYVOICE_PORT"

if [[ "$COSYVOICE_ENTRY" == "runtime/python/fastapi/server.py" ]]; then
  exec "$COSYVOICE_PYTHON" "$COSYVOICE_ENTRY" --port "$COSYVOICE_PORT" ${COSYVOICE_EXTRA_ARGS}
fi

exec "$COSYVOICE_PYTHON" "$COSYVOICE_ENTRY" --host "$COSYVOICE_HOST" --port "$COSYVOICE_PORT" ${COSYVOICE_EXTRA_ARGS}
