#!/bin/bash
# Pocket-Earth 公开仓库「写操作」拦截器（用户硬约束：绝对不能乱动公开仓库 Pocket-Earth）。
# 放行：私人备份仓库 Pocket-Earth-Plus（origin）的一切操作。
# 拦截：对 public-DO-NOT-PUSH 这个 remote、或公开仓库 URL(narratorzhang0307/Pocket-Earth) 的任何 git 命令。
# 契约：exit 2 = 阻止该 Bash 工具调用，stderr 文本反馈给 Claude。
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('tool_input',{}).get('command',''))
except Exception: print('')" 2>/dev/null)
[ -z "$cmd" ] && exit 0

# 先抹掉私人仓库标识，避免把 Pocket-Earth-Plus 误判成公开仓库 Pocket-Earth
masked=$(printf '%s' "$cmd" | sed -E 's#[Pp]ocket-?[Ee]arth-[Pp]lus##g')

# 命中：公开仓库的 remote 名 / URL（已抹掉 Plus，剩下的才是真公开仓库）
if printf '%s' "$masked" | grep -qiE 'public-DO-NOT-PUSH|narratorzhang0307/[Pp]ocket-?[Ee]arth(\.git)?'; then
  echo "🛑 已拦截：禁止对 Pocket-Earth 公开仓库做任何 git 操作（用户硬约束·命令禁止）。" >&2
  echo "   代码备份只允许推送到私人仓库 origin (Pocket-Earth-Plus)。如确需操作公开仓库，请用户本人手动执行。" >&2
  exit 2
fi
exit 0
