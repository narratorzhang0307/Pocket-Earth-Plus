#!/usr/bin/env bash
# 下载已转换为 MNN 格式的 Qwen 模型（官方已转好量化好，直接可用，免自己转）。
# 文本模型用小尺寸 Qwen3.5(0.8B/2B)，视觉模型用 Qwen3-VL-2B-Instruct。
# 模型仓库：modelscope.cn/organization/MNN（也可 huggingface MNN 组织）。
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-$HOME/mnn-models}"
TEXT_REPO="${TEXT_REPO:-MNN/Qwen3.5-0.8B-MNN}"     # 文本：分类/排序/对话/嵌入
VISION_REPO="${VISION_REPO:-MNN/Qwen3-VL-2B-Instruct-MNN}"  # 视觉：截图理解/打标

mkdir -p "$MODELS_DIR"

if ! command -v modelscope >/dev/null 2>&1; then
  echo "[fetch-models] 安装 modelscope cli： pip install modelscope" >&2
  exit 1
fi

echo "[fetch-models] 下载文本模型 $TEXT_REPO"
modelscope download "$TEXT_REPO" --local_dir "$MODELS_DIR/$(basename "$TEXT_REPO")"

echo "[fetch-models] 下载视觉模型 $VISION_REPO（约 1.3GB）"
modelscope download "$VISION_REPO" --local_dir "$MODELS_DIR/$(basename "$VISION_REPO")"

# 校验文件清单：文本至少 config.json/llm.mnn/llm.mnn.weight；视觉额外多 visual.mnn/visual.mnn.weight
check() {
  local d="$1"; shift
  for f in "$@"; do
    [ -f "$d/$f" ] && echo "  OK  $d/$f" || { echo "  缺失 $d/$f" >&2; return 1; }
  done
}
echo "[fetch-models] 校验文本模型："
check "$MODELS_DIR/$(basename "$TEXT_REPO")" config.json llm.mnn llm.mnn.weight || true
echo "[fetch-models] 校验视觉模型(多一对视觉编码器权重)："
check "$MODELS_DIR/$(basename "$VISION_REPO")" config.json llm.mnn llm.mnn.weight visual.mnn visual.mnn.weight || true

# 端侧任务(分类/排序/打标)要快要简短，关掉 Qwen3 思考模式（默认开会先吐一大段 <think> 拖慢数十倍）
echo "[fetch-models] 关闭思考模式(端侧提速)"
for d in "$MODELS_DIR/$(basename "$TEXT_REPO")" "$MODELS_DIR/$(basename "$VISION_REPO")"; do
  cfg="$d/config.json"
  [ -f "$cfg" ] && python3 - "$cfg" <<'PY' 2>/dev/null || true
import json,sys
c=json.load(open(sys.argv[1]))
c.setdefault("jinja",{}).setdefault("context",{})["enable_thinking"]=False
json.dump(c,open(sys.argv[1],"w"),ensure_ascii=False,indent=4)
PY
done

echo "[fetch-models] 完成。文本 config： $MODELS_DIR/$(basename "$TEXT_REPO")/config.json"
echo "                视觉 config： $MODELS_DIR/$(basename "$VISION_REPO")/config.json"
echo "[fetch-models] 起 sidecar： PYTHON=~/mnn-venv/bin/python bash serve.sh"
