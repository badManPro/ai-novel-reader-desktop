#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${GPTSOVITS_ENV_FILE:-$SCRIPT_DIR/gpt-sovits.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

GPTSOVITS_HOST="${GPTSOVITS_HOST:-127.0.0.1}"
GPTSOVITS_PORT="${GPTSOVITS_PORT:-9881}"
GPTSOVITS_PYTHON="${GPTSOVITS_PYTHON:-python3}"
GPTSOVITS_ENTRY="${GPTSOVITS_ENTRY:-api_v2.py}"
GPTSOVITS_MODEL_DIR="${GPTSOVITS_MODEL_DIR:-}"
GPTSOVITS_EXTRA_ARGS="${GPTSOVITS_EXTRA_ARGS:-}"

fail() {
  echo "[gpt-sovits] $1" >&2
  exit 1
}

is_placeholder_path() {
  local value="$1"
  [[ -z "$value" || "$value" == "/absolute/path/to/"* || "$value" == "changeme" || "$value" == "TODO" ]]
}

if is_placeholder_path "$GPTSOVITS_MODEL_DIR"; then
  fail "GPTSOVITS_MODEL_DIR 未设置为真实目录。请编辑 $ENV_FILE，填入 GPT-SoVITS 仓库/服务目录。"
fi

if [[ ! -d "$GPTSOVITS_MODEL_DIR" ]]; then
  fail "GPTSOVITS_MODEL_DIR 不存在：$GPTSOVITS_MODEL_DIR"
fi

if [[ "$GPTSOVITS_PYTHON" == "python3" && -x "$GPTSOVITS_MODEL_DIR/.venv/bin/python" ]]; then
  GPTSOVITS_PYTHON="$GPTSOVITS_MODEL_DIR/.venv/bin/python"
fi

if ! command -v "$GPTSOVITS_PYTHON" >/dev/null 2>&1 && [[ ! -x "$GPTSOVITS_PYTHON" ]]; then
  fail "找不到 Python 解释器：$GPTSOVITS_PYTHON"
fi

cd "$GPTSOVITS_MODEL_DIR"

if [[ ! -f "$GPTSOVITS_ENTRY" ]]; then
  fail "入口脚本不存在：$GPTSOVITS_MODEL_DIR/$GPTSOVITS_ENTRY"
fi

echo "[gpt-sovits] using env: $ENV_FILE"
echo "[gpt-sovits] python: $GPTSOVITS_PYTHON"
echo "[gpt-sovits] cwd: $GPTSOVITS_MODEL_DIR"
echo "[gpt-sovits] entry: $GPTSOVITS_ENTRY"
echo "[gpt-sovits] listen: http://$GPTSOVITS_HOST:$GPTSOVITS_PORT"

if [[ "$GPTSOVITS_ENTRY" == "api_v2.py" ]]; then
  exec "$GPTSOVITS_PYTHON" "$GPTSOVITS_ENTRY" -a "$GPTSOVITS_HOST" -p "$GPTSOVITS_PORT" ${GPTSOVITS_EXTRA_ARGS}
fi

exec "$GPTSOVITS_PYTHON" "$GPTSOVITS_ENTRY" --host "$GPTSOVITS_HOST" --port "$GPTSOVITS_PORT" ${GPTSOVITS_EXTRA_ARGS}
