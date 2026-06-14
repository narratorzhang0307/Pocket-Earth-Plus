#!/usr/bin/env bash
# 把 MNN 格式模型推进手机 App 私有目录。
# JNI 以 config.json 的【绝对路径】为入口加载整套文件，所以目录结构必须完整。
set -euo pipefail

PKG="${PKG:-com.pocketearth.edge}"          # 你的 App 包名
MODEL_SRC="${MODEL_SRC:?用法: MODEL_SRC=/path/to/Qwen3-VL-2B-Instruct-MNN PKG=<包名> bash push-to-device.sh}"
NAME="$(basename "$MODEL_SRC")"
DEST="files/mnn_models/$NAME"               # App 私有目录下的相对路径

command -v adb >/dev/null 2>&1 || { echo "未找到 adb（装 Android platform-tools）" >&2; exit 1; }

echo "[push] 1/3 推到 /data/local/tmp/$NAME"
adb push "$MODEL_SRC/." "/data/local/tmp/$NAME/"

echo "[push] 2/3 用 run-as 拷进 App 私有目录 $DEST"
adb shell run-as "$PKG" mkdir -p "$DEST"
adb shell run-as "$PKG" cp -r "/data/local/tmp/$NAME/." "$DEST"

echo "[push] 3/3 清理临时目录"
adb shell rm -rf "/data/local/tmp/$NAME"

echo "[push] 完成。App 内以绝对路径加载： /data/data/$PKG/$DEST/config.json"
echo "  视觉模型应含 config.json / llm.mnn / llm.mnn.weight / visual.mnn / visual.mnn.weight 全套。"
