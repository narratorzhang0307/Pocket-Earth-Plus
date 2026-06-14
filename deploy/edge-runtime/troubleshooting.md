# 端侧部署 · 降级与踩坑

## 1. 输出截断（最大单点风险）
**现象**：结构化输出常在 `{"summary":""}` 后就停，token 计数极小直接结束。
**根因**：预编译 libMNN 在 step decode 时，遇到 Markdown 代码块前缀(```)会错误触发"假结束符"，
JNI/解码层误以为生成完成而提前终止。做 classify/rank/vision 的结构化(JSON)输出时最容易踩。
**解法（双层防御）**：
- sidecar 层(`server.py`)：要 JSON 时在 system 里强制"只输出纯 JSON、不要 ``` 代码块"，并在返回前 `_strip_fence` 剥掉围栏。
- 应用层(`provider-compat/mnn`)：同样注入"纯 JSON / 禁 Markdown 围栏"的 quirk。
- 必要时在 JNI/解码层修正结束符判定逻辑。

## 2. iOS 编译签名 / 权限
- Xcode 里 Signing 选自己的 Team、改唯一 Bundle Identifier。
- **非付费开发者账号**：删掉 `Extended Virtual Addressing` 和 `Increased Memory Limit` 两个权限(entitlement)，否则无法编译。

## 3. so 与 NDK 版本不匹配
- 预编译 `libMNN.so` 对应特定 NDK(实测 r27 / 27.0.12077973)。自编时 `ANDROID_NDK` 要指向同档 NDK，否则运行时崩。

## 4. 加载 OOM / 闪退
- 开 `use_mmap=true`(内存映射)与编译期 `-DMNN_LOW_MEMORY=true`；视觉模型约 1.3GB，小内存设备优先 4bit。

## 5. 模型加载失败
- JNI 以 `config.json` 的**绝对路径**为入口加载整套文件，目录结构必须完整：
  文本 `config.json/llm.mnn/llm.mnn.weight`；视觉额外 `visual.mnn/visual.mnn.weight`。少一个就加载失败。

## 6. 三级优雅降级（应用侧已内建）
sidecar 起不来 / 出错时，`/api/edge` 的后端探测会自动回落，UI 全程不崩：

```
MNN sidecar 就绪? → mnn
   否 → ollama 就绪? → ollama
        否 → stub(规则兜底: classify 取首项 / rank 均匀降序 / embed 空)
```

每一步成败由 `frost-agent/harness/health.ts` 的 `recordHealth('edge.*')` 记录，便于在 UI/日志看到"已降级到哪条路"，而不是静默失败。
