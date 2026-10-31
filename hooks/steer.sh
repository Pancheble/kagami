#!/usr/bin/env bash
# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 출처: https://github.com/anthropics/cwc-long-running-agents (ad107a9) claude-code-config/.claude/hooks/steer.sh, 고치지 않고 가져왔다.
# kagami는 구현 세션마다 AGENT_STEER_FILE을 그 잎의 파일로 걸어 부른다(src/steer.ts)
# If STEER.md has content, surface it to the agent once and clear the file.
# Write to STEER.md (or pipe from a UI) to redirect the agent mid-run.
# Note: this is a convenience channel, not a trust boundary; if the agent has
# Write access to the project it can write STEER.md itself.
f="${AGENT_STEER_FILE:-./STEER.md}"
if [ -s "$f" ]; then
  note=$(cat "$f")
  reason=$(python3 -c 'import json,sys; print(json.dumps("OPERATOR STEERING: " + sys.argv[1] + "\n\nPause what you were about to do, incorporate this guidance, then continue toward the feature goal."))' "$note" 2>/dev/null) || exit 0
  printf '{"decision":"block","reason":%s}\n' "$reason"
  : > "$f"
fi
