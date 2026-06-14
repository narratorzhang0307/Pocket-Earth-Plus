import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { setFrostBrain } from "../frost-agent/harness/brain";
import { httpBrain } from "../frost-agent/harness/httpBrain";
import { seedProfileFromLibrary } from "./app/lib/profileSeed";
import { startHeartbeat } from "../frost-agent/harness/heartbeat";

// 接入真实大脑（DeepSeek，经 /api/frost-llm 代理）；无 key 时 agent 自动走规则 fallback
setFrostBrain(httpBrain);

// 用库存给长期画像播种一次（幂等）；之后用户每记一条会增量追加
seedProfileFromLibrary();

// P2-H：启动 agent 主动性 heartbeat（开着应用就定期按画像产今日推荐；建议→采纳才落地）
startHeartbeat();

createRoot(document.getElementById("root")!).render(<App />);
