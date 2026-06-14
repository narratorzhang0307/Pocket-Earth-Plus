# 端侧性能 / 内存调优

目标：让端侧的「挑/找」(分类、排序、视觉打标) 达到可演示的时延，内存不闪退。

## 运行参数（sidecar / llm_demo / App 通用思路）
| 参数 | 建议 | 作用 |
|---|---|---|
| `thread_num` | = 设备大核数 | 绑大核并行，吃满算力 |
| `precision` | `low` | 低精度换速度，端侧小任务影响小 |
| `use_mmap` | `true` | 内存映射加载权重，防大模型加载时 OOM 闪退 |
| `sampler_type` | 按需 | 调输出"性格"(确定性 vs 发散)；做结构化输出建议偏确定性 |

sidecar 用环境变量传：`MNN_THREAD_NUM` / `MNN_PRECISION` / `MNN_USE_MMAP`（见 serve.sh）。

## 编译期开关（决定能不能加速 / 跑多模态）
- `-DMNN_ARM82=true`：启用 Arm 加速路径(可达 SME2 指令集)，端侧 CPU 推理提速的关键。
- `-DMNN_OPENCL=true`：Android GPU 加速；iOS 用 `-DMNN_METAL=ON`。
- `-DMNN_LOW_MEMORY=true` + `-DMNN_CPU_WEIGHT_DEQUANT_GEMM=true`：低内存 + 权重反量化 GEMM。
- 视觉/音频：`-DMNN_BUILD_OPENCV -DMNN_IMGCODECS -DMNN_OPENCV -DMNN_BUILD_AUDIO -DLLM_SUPPORT_AUDIO`。

## 量化位宽 vs 质量
- 4bit：体积最小、最快，端侧首选；分类/排序这类判别任务质量足够。
- 8bit：质量更好、体积翻倍；视觉细节或长文生成更稳时可用。

## 预期与记录
- 视觉模型(约 1.3GB)首次加载需数十秒(由设备性能决定)，状态 `Weights OK · loading MNN → Ready`。
- 文本小模型(0.8B)冷加载数秒；常驻后单次短任务(分类/一次 rank ≈10 候选)目标 < 1s。
- 调优前后把 **首 token 时延 / tok·s⁻¹ / 一次 rank 端到端** 三个数字记在这里，便于回归对比：

| 配置 | 首 token | tok/s | 一次 rank |
|---|---|---|---|
| (待测) | | | |
