# 端侧推理部署框架 · MNN × Qwen

把 Pocket Earth 的「端侧 Selector」(挑/找：分类、排序、嵌入、视觉打标) 真正落到**端侧设备上的 MNN-LLM**，
跑小尺寸 Qwen 文本模型 + Qwen-VL 视觉模型，全程本地、离线、隐私不出端。
文本生成(写)仍可走云 Brain，构成「云+端」混合，但**核心交互决策在端侧完成**。

> 这份讲「怎么部署运行」；契约与前端如何调用见 [`frost-agent/edge/README.md`](../../frost-agent/edge/README.md)。
> 关键事实：前端 `httpEdge.ts` 与应用代码 **backend 无关**——切到 MNN 后端**不改一行前端**，
> 只需起本机 sidecar 并把 `.env` 指过去。

## 数据流

```
应用前端 (httpEdge, 不变)
   │  POST /api/edge  { task, ... }            ← 统一契约 EdgeRequest
   ▼
路由/适配层 (frost-agent/edge)                   ← 探测后端: mnn? → ollama? → stub
   │  classify/rank/vision 的提示整形在这层
   ▼
MNN sidecar (deploy/edge-runtime/server.py)      ← OpenAI 兼容 /v1/chat /v1/embeddings /health
   ▼
MNN-LLM 引擎 (libMNN, Arm82/SME2 · OpenCL/Metal · low_memory + mmap + 绑大核)
   │  llm.mnn  (Qwen3.5 文本)  +  visual.mnn (Qwen3-VL 视觉)
```

## 三种宿主

| 宿主 | 用途 | 走哪几步 |
|---|---|---|
| **本机(Mac/Linux/WSL)** | 开发联调、最小可信端侧 demo | build-mnn → fetch-models → serve |
| **Android 手机** | 真机端侧(Arm SoC，可达 SME2) | build-android → push-to-device → 设备内端点 |
| **iOS** | 真机端侧(Metal 加速) | MNN framework + Xcode（见 troubleshooting 的签名/权限） |

## 快速起（本机）

```bash
cd deploy/edge-runtime
bash build-mnn.sh          # 1. 编译 MNN 引擎(含 LLM/多模态)
bash fetch-models.sh      # 2. 拉 MNN 格式的 Qwen 文本+视觉模型
bash serve.sh             # 3. 起本机 sidecar (默认 127.0.0.1:8000)
# 4. 应用 .env 设：EDGE_BACKEND=mnn  MNN_URL=http://127.0.0.1:8000  然后 npm run dev
# 5. 验证：DevTools 里 /api/edge 响应 backend 变成 'mnn'，前端无改动
```

没装/没起 sidecar 也不影响：应用会自动回落 ollama → stub，UI 不崩。

## 文件
| 文件 | 作用 |
|---|---|
| `build-mnn.sh` | 本机编译 MNN 引擎(开 LLM/多模态/转换器) |
| `build-android.sh` | 编译手机多模态 `libMNN.so`(视觉/音频/Arm 开关) |
| `fetch-models.sh` | 下载已转 MNN 格式的 Qwen 文本+视觉模型 |
| `convert-quantize.sh` | 没有现成包时自行转换+量化(4bit) |
| `push-to-device.sh` | 把模型推进手机 App 私有目录 |
| `serve.sh` / `server.py` | 本机 MNN sidecar(OpenAI 兼容 HTTP) |
| `tuning.md` | 性能/内存调优手册 |
| `troubleshooting.md` | 降级与踩坑(输出截断、签名权限、NDK、OOM) |

## 模型
- 文本：Qwen3.5 小尺寸(0.8B/2B)，做分类/排序/对话/嵌入。
- 视觉：Qwen3-VL-2B-Instruct，做截图理解/视觉打标；MNN 格式约 1.3GB，含 `config.json / llm.mnn / llm.mnn.weight / visual.mnn / visual.mnn.weight`。
- 仓库：已转好的在 `modelscope.cn/organization/MNN`；原始模型在 `modelscope.cn/organization/Qwen`。
