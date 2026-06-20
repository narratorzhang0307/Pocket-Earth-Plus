# 端侧模型层（Edge）

Pocket Earth 的「端侧 Selector」：在手机 / 本机跑小模型做**挑和找**——选歌 / 选图 / 选书 / 意图分类 / 嵌入 / 视觉打标。对齐 v2.0「端侧管挑和找、云管写」的双速架构（见 [../ARCHITECTURE.md](../ARCHITECTURE.md)）。

模型选型沿用 **Qwen + MNN** 路线：文本用 Qwen3-0.6B/1.7B，视觉用 Qwen3-VL-2B。

## 架构（可插拔后端）

```
前端 EdgeModel (httpEdge)  ──POST /api/edge──►  端侧后端
  chat / classify / rank / embed / vision         ├─ ollama  本机 demo：Qwen3 / Qwen-VL，HTTP 直连
                                                   ├─ mnn     手机 / PC 生产：MNN-LLM 跑 MNN 格式 Qwen3 / Qwen3-VL
                                                   └─ stub    无模型时规则兜底（调用方自动降级）
```

- 接口：[`types.ts`](types.ts)（`EdgeModel` / `Selector`）。
- 前端客户端：[`httpEdge.ts`](httpEdge.ts)（失败安全降级）。
- 服务端中间件：[`viteEdge.ts`](viteEdge.ts)（探测 ollama → 路由 → stub）。
- 配置（`.env`）：`OLLAMA_URL` / `EDGE_MODEL` / `EDGE_VISION_MODEL`。

> 现状：未装模型时全部走 stub（规则兜底），UI 与 agent 照常工作；装好下方任一后端即真跑端侧。

## A. 本机 demo —— ollama（最快）

```bash
# 1. 安装 ollama（macOS 可用官方 App 或 brew install ollama）
# 2. 拉取模型
ollama pull qwen3:0.6b        # 文本：选歌 / 选书 / 分类 / 嵌入（约 523MB）
ollama pull qwen2.5vl:3b      # 视觉：照片打标 / 场景分析（Qwen-VL）
# 3. 启动服务（默认 http://localhost:11434）
ollama serve
```

`.env` 里按需覆盖：

```
EDGE_MODEL=qwen3:0.6b
EDGE_VISION_MODEL=qwen2.5vl:3b
OLLAMA_URL=http://localhost:11434
```

启动 `npm run dev`，中间件会自动探测到 ollama 并接管 `/api/edge`。

## B. 手机 / PC 生产 —— MNN-LLM（Qwen MNN 格式）

MNN-LLM 是把 Qwen 跑在手机 / PC 的端侧推理引擎（ARM SoC 高效计算）。要点：

1. 编译 MNN（开启 LLM 组件；视觉再加图像 / 视觉相关开关）：
   ```bash
   git clone https://github.com/alibaba/MNN.git && cd MNN
   mkdir build && cd build
   cmake -DMNN_BUILD_LLM=ON -DMNN_BUILD_CONVERTER=ON ..
   make -j8
   ```
2. 取 MNN 格式的量化模型（ModelScope `MNN/` 官方已转好）：
   - 文本：`MNN/Qwen3-0.6B-MNN`（含 `config.json` / `llm.mnn` / `llm.mnn.weight`）
   - 视觉：`MNN/Qwen3-VL-2B-Instruct-MNN`（约 1.3GB，含 `llm.mnn` + `visual.mnn`）
   - 也可用 `transformers/llm/export/llmexport.py` 自行从原始 Qwen 转换。
3. 命令行验证：`llm_demo config.json prompt.txt`。
4. 集成到 app：Android 编译 `libMNN.so`、iOS 编译 `MNN.framework`，JNI / 原生桥接调用；模型 `adb push` 到设备私有目录，`config.json` 用完整绝对路径。
5. 调优：`precision`（fp16/low）、`use_mmap=true`（省内存防闪退）、`sampler_type`。

接好后把本中间件的后端从 ollama 换成指向 MNN-LLM 的本地服务即可（`viteEdge.ts` 里加 `mnn` 分支），前端接口不变。

## 模型清单

| 用途 | ollama（本机 demo） | MNN（手机 / PC 生产） |
|---|---|---|
| 文本（选歌/选书/分类/嵌入） | `qwen3:0.6b` | `MNN/Qwen3-0.6B-MNN` |
| 视觉（照片打标/场景分析） | `qwen2.5vl:3b` | `MNN/Qwen3-VL-2B-Instruct-MNN` |

一键拉本机 demo 模型：`bash frost-agent/edge/download-models.sh`

## 在 Pocket Earth 里哪里用

- `open-dj-director` 选歌 → `Selector.rank` 端侧排序候选曲目（云只写串词）。
- `photos-agent` 给相册照片打标 / 价值打分 → `EdgeModel.vision`（Qwen-VL），原图不出端。
- 意图预分类 → `Selector.classify`，挡在云路由之前。
- 个人记忆 / RAG 检索 → `Selector.embed`。
