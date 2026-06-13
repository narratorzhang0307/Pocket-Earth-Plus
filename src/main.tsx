import { createRoot } from "react-dom/client";
import MyCityTab from "./app/components/MyCityTab";
import "./styles/index.css";

// 仿「上街去」手机 App 尺寸：393×852 手机框，居中在灰底上
createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen w-full bg-[#dcdcdc] flex items-center justify-center p-4 overflow-auto">
    <div className="relative w-[393px] h-[852px] shrink-0 bg-[#EAEAEA] overflow-hidden shadow-2xl flex flex-col">
      <MyCityTab savedTreeIds={[]} />
    </div>
  </div>
);
