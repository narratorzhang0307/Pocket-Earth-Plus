#!/usr/bin/env bash
# 起本机 MNN sidecar（端侧推理 HTTP 端点），带端侧调优参数。
# 起好后把应用的 .env 设成 EDGE_BACKEND=mnn、MNN_URL=http://127.0.0.1:8000 即可切到端侧。
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-$HOME/mnn-models}"
export MNN_TEXT_CONFIG="${MNN_TEXT_CONFIG:-$MODELS_DIR/Qwen3.5-0.8B-MNN/config.json}"
export MNN_VISION_CONFIG="${MNN_VISION_CONFIG:-$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN/config.json}"
export MNN_PORT="${MNN_PORT:-8000}"
export MNN_THREAD_NUM="${MNN_THREAD_NUM:-4}"   # 绑大核数量
export MNN_PRECISION="${MNN_PRECISION:-low}"   # low 换速度
export MNN_USE_MMAP="${MNN_USE_MMAP:-true}"    # 防大模型加载闪退

echo "[serve] 文本模型: $MNN_TEXT_CONFIG"
echo "[serve] 视觉模型: $MNN_VISION_CONFIG"
echo "[serve] 端口: $MNN_PORT  线程: $MNN_THREAD_NUM  精度: $MNN_PRECISION  mmap: $MNN_USE_MMAP"
# 用装了 MNN 的解释器（venv）。设 PYTHON 指向它，例如 PYTHON=~/mnn-venv/bin/python
exec "${PYTHON:-python3}" "$(dirname "$0")/server.py"
