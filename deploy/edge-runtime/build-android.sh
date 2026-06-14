#!/usr/bin/env bash
# 编译手机(Android / Arm)用的多模态 libMNN.so。
# 关键：默认构建只得到几 MB 基础库，跑不了多模态(视觉/音频)；必须开下面这组开关。
# 视觉输入靠 OpenCV/ImgCodecs；Arm 加速靠 ARM82(可达 SME2 指令集) + OpenCL(GPU)。
set -euo pipefail

MNN_DIR="${MNN_DIR:-$HOME/mnn-src/MNN}"
# NDK 版本要与预编译产物一致(教程实测 r27)；不一致会出现 so 与运行时不匹配。
export ANDROID_NDK="${ANDROID_NDK:-$HOME/Android/sdk/ndk/27.0.12077973}"

[ -d "$MNN_DIR" ] || { echo "找不到 $MNN_DIR，先 bash build-mnn.sh 克隆 MNN" >&2; exit 1; }
[ -d "$ANDROID_NDK" ] || { echo "找不到 NDK: $ANDROID_NDK（设 ANDROID_NDK 指向 ndk/27.x）" >&2; exit 1; }

cd "$MNN_DIR/project/android"
mkdir -p build_64 && cd build_64

echo "[build-android] 编译多模态 libMNN.so（NDK: $ANDROID_NDK）"
../build_64.sh "-DMNN_LOW_MEMORY=true \
  -DMNN_CPU_WEIGHT_DEQUANT_GEMM=true \
  -DMNN_BUILD_LLM=true \
  -DMNN_SUPPORT_TRANSFORMER_FUSE=true \
  -DMNN_ARM82=true \
  -DMNN_USE_LOGCAT=true \
  -DMNN_OPENCL=true \
  -DLLM_SUPPORT_AUDIO=true \
  -DMNN_BUILD_OPENCV=true \
  -DMNN_IMGCODECS=true \
  -DMNN_OPENCV=true \
  -DMNN_BUILD_AUDIO=true \
  -DMNN_SEP_BUILD=OFF"

make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 8)"

echo "[build-android] 完成。产物 libMNN.so 放进 App 的 jniLibs/arm64-v8a/。"
echo "  说明：少了 OPENCV/IMGCODECS/AUDIO 开关，视觉/音频会缺能力；少了 LLM 开关，连文本都跑不了。"
