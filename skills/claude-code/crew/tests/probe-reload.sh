#!/usr/bin/env bash
# Probe: which project changes does a running Claude Code session pick up without a restart?
#
#   tests/probe-reload.sh [fresh|partial|rerun|all]   (default all; needs claude and jq; about 5 cents)
#
# /crew setup writes hooks into .claude/settings.json, agents into .claude/agents/, a block into
# CLAUDE.md, and the crew skill is updated in place. This drives a real session in stream-json mode
# (the way the Agent SDK, and so Paseo, runs Claude Code), makes those kinds of change between two
# turns of the same session, and checks each one objectively: hook marker files, the Agent and
# Skill tool results, and a nonce only the changed CLAUDE.md holds. Then a new session runs the
# same turn as the control: everything must work there, or the probe itself is broken.
#
#   fresh    the project had no .claude/ and no CLAUDE.md when the session started (a first setup)
#   partial  it had .claude/settings.json, but no .claude/agents/ or .claude/skills/
#   rerun    it had them all, with older versions of the same hook, agent and skill (setup after an update)
#
# To try it by hand in the interactive CLI (or any other client):
#   tests/probe-reload.sh prepare <fresh|partial|rerun> <dir>   then start claude in <dir> and send a message
#   tests/probe-reload.sh change <dir>                         then send the prompt it prints
#
# The changed session asks twice: right after the change, and again PROBE_DELAY seconds later (default
# 30), to tell "not yet" from "never".

set -uo pipefail
command -v claude >/dev/null && command -v jq >/dev/null || { echo "needs claude and jq" >&2; exit 2; }
SCENARIOS=("${1:-all}"); [[ "${SCENARIOS[0]}" == all ]] && SCENARIOS=(fresh partial rerun)
DELAY="${PROBE_DELAY:-30}"
MODEL="${PROBE_MODEL:-haiku}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

hook() { # event marker → a hook entry that touches markers/<marker>
  jq -n --arg e "$1" --arg m "$2" \
    '{($e): [{hooks: [{type: "command", command: ("mkdir -p \"$CLAUDE_PROJECT_DIR/markers\" && touch \"$CLAUDE_PROJECT_DIR/markers/" + $m + "\"")}]}]}'
}
agent() { # dir name code
  mkdir -p "$1/.claude/agents"
  printf -- '---\nname: %s\ndescription: Probe agent. Use only when asked by name.\nmodel: haiku\ntools: []\n---\n\nReply with exactly this and nothing else: %s\n' "$2" "$3" >"$1/.claude/agents/$2.md"
}
skill() { # dir name code
  mkdir -p "$1/.claude/skills/$2"
  printf -- '---\nname: %s\ndescription: Probe skill. Use only when asked by name.\n---\n\nThe code of this skill is %s.\n' "$2" "$3" >"$1/.claude/skills/$2/SKILL.md"
}

before() { # dir scenario nonce: the project when the session starts
  mkdir -p "$1"; git -C "$1" init -q
  [[ "$2" == partial ]] && { mkdir -p "$1/.claude"; echo '{}' >"$1/.claude/settings.json"; }
  [[ "$2" == rerun ]] || return 0
  jq -n --argjson a "$(hook UserPromptSubmit ups-old)" '{hooks: $a}' >"$1/.claude-settings.tmp"
  mkdir -p "$1/.claude"; mv "$1/.claude-settings.tmp" "$1/.claude/settings.json"
  agent "$1" probe-old "AGENT-OLD-$3-v1"
  skill "$1" probe-old-skill "SKILL-OLD-$3-v1"
  printf '# Project\n\nNothing here yet.\n' >"$1/CLAUDE.md"
}

change() { # dir nonce: what setup does mid-session
  local a b c d
  a="$(hook UserPromptSubmit ups-new)"; b="$(hook PreToolUse pre-new)"; c="$(hook Stop stop-new)"; d="$(hook SubagentStart substart-new)"
  # rerun: the existing UserPromptSubmit entry is replaced by one with a different command.
  mkdir -p "$1/.claude"
  jq -n --argjson a "$a" --argjson b "$b" --argjson c "$c" --argjson d "$d" '{hooks: ($a + $b + $c + $d)}' >"$1/.claude/settings.json.new"
  mv "$1/.claude/settings.json.new" "$1/.claude/settings.json"
  agent "$1" probe-new "AGENT-NEW-$2"
  agent "$1" probe-old "AGENT-OLD-$2-v2"
  skill "$1" probe-new-skill "SKILL-NEW-$2"
  skill "$1" probe-old-skill "SKILL-OLD-$2-v2"
  printf '# Project\n\nThe probe code word is CLAUDEMD-%s.\n' "$2" >"$1/CLAUDE.md"
}

ASK='Do these steps in order, one tool call at a time, and do not explain:
1. Run the Bash command `true`.
2. Call the Agent tool with subagent_type "probe-new" and prompt "go".
3. Call the Agent tool with subagent_type "probe-old" and prompt "go".
4. Call the Skill tool with skill "probe-new-skill".
5. Call the Skill tool with skill "probe-old-skill".
Then reply with one line: the code word from CLAUDE.md if one is in your context (do not read any file for it), else NONE.'

msg() { jq -cn --arg t "$1" '{type: "user", message: {role: "user", content: $t}}'; }

# Run turns in one session: start, send turn 1, wait, run the hook between, send turn 2, wait.
session() { # dir out between-cmd prompt1 prompt2...
  local dir="$1" out="$2" between="$3"; shift 3
  local fifo="$dir.fifo"; mkfifo "$fifo"
  (cd "$dir" && claude -p --input-format stream-json --output-format stream-json --verbose \
      --model "$MODEL" --effort low --no-session-persistence \
      --allowedTools "Bash(true)" Agent Skill <"$fifo" >"$out" 2>"$out.err") &
  local pid=$! n=0
  exec 7>"$fifo"
  for p in "$@"; do
    msg "$p" >&7; n=$((n + 1))
    for _ in $(seq 1 360); do
      [[ "$(grep -c '"type":"result"' "$out" 2>/dev/null)" -ge $n ]] && break
      kill -0 $pid 2>/dev/null || break; sleep 0.5
    done
    if [[ $n -eq 1 && -n "$between" ]]; then eval "$between"; sleep 3; fi
    if [[ $n -eq 2 && $# -gt 2 ]]; then sleep "$DELAY"; fi
  done
  # At end of input the CLI may linger: give it a few seconds, then stop it.
  exec 7>&-
  for _ in $(seq 1 20); do kill -0 $pid 2>/dev/null || break; sleep 0.5; done
  pkill -P $pid 2>/dev/null; kill $pid 2>/dev/null; wait $pid 2>/dev/null; rm -f "$fifo"
}

# What the stream says about turn k: each Agent and Skill result, the final reply.
report() { # out dir nonce label k
  local out="$1" dir="$2" nonce="$3" label="$4" k="$5" from to
  from="$(grep -n '"type":"result"' "$out" | sed -n "$((k - 1))p" | cut -d: -f1)"
  to="$(grep -n '"type":"result"' "$out" | sed -n "${k}p" | cut -d: -f1)"
  [[ -n "$to" ]] || { printf '\n== %s\n  (no turn %s)\n' "$label" "$k"; return; }
  local turn; turn="$(sed -n "$((${from:-0} + 1)),${to}p" "$out")"
  local results; results="$(jq -rc 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | [.tool_use_id, ((.content|if type=="array" then map(.text? // "")|join(" ") else tostring end) | gsub("\\s+";" ") | .[0:160])] | @tsv' <<<"$turn" 2>/dev/null)"
  local calls; calls="$(jq -rc 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | [.id, .name, (.input.subagent_type // .input.skill // .input.command // "")] | @tsv' <<<"$turn" 2>/dev/null)"
  local final; final="$(jq -r 'select(.type=="result") | .result' <<<"$turn" | tail -1)"
  printf '\n== %s\n' "$label"
  printf '  hook markers: %s\n' "$(ls "$dir/markers" 2>/dev/null | tr '\n' ' ' || true)"
  local id name arg res
  while IFS=$'\t' read -r id name arg; do
    [[ -n "$id" ]] || continue
    res="$(grep -F "$id" <<<"$results" | cut -f2)"
    printf '  %-6s %-16s → %s\n' "$name" "$arg" "${res:-(no result)}"
  done <<<"$calls"
  printf '  CLAUDE.md word: %s (expected CLAUDEMD-%s)\n' "$(tr '\n' ' ' <<<"$final" | cut -c1-120)" "$nonce"
  printf '  cost: $%s\n' "$(jq -r 'select(.type=="result") | .total_cost_usd' "$out" | tail -1)"
}

case "${1:-}" in
  prepare) n="$(LC_ALL=C tr -dc 'A-Z0-9' </dev/urandom | head -c 6)"; before "$3" "$2" "$n"; echo "$n" >"$3/.probe-nonce"; echo "Prepared $3 ($2)."; exit 0 ;;
  change) change "$2" "$(cat "$2/.probe-nonce")"; rm -rf "$2/markers"
    printf 'Changed %s (nonce %s). Now send:\n\n%s\n\nThen: ls %s/markers\n' "$2" "$(cat "$2/.probe-nonce")" "$ASK" "$2"; exit 0 ;;
esac

for sc in "${SCENARIOS[@]}"; do
  nonce="$(LC_ALL=C tr -dc 'A-Z0-9' </dev/urandom | head -c 6)"
  dir="$WORK/$sc"
  before "$dir" "$sc" "$nonce"
  extra=(); [[ "$sc" == rerun ]] || extra=("$ASK")
  session "$dir" "$WORK/$sc.jsonl" "change '$dir' '$nonce'; rm -rf '$dir/markers'" "Reply with OK." "$ASK" ${extra[@]+"${extra[@]}"}
  printf '\n######## %s (nonce %s)\n' "$sc" "$nonce"
  printf '  init: agents=%s skills=%s\n' \
    "$(jq -rc 'select(.subtype=="init") | [.agents[]? | select(startswith("probe"))]' "$WORK/$sc.jsonl" | head -1)" \
    "$(jq -rc 'select(.subtype=="init") | [.skills[]? | select(startswith("probe"))]' "$WORK/$sc.jsonl" | head -1)"
  report "$WORK/$sc.jsonl" "$dir" "$nonce" "same session, after the change" 2
  [[ "$sc" == rerun ]] || report "$WORK/$sc.jsonl" "$dir" "$nonce" "same session, ${DELAY}s later" 3
  rm -rf "$dir/markers"
  session "$dir" "$WORK/$sc.control.jsonl" "" "Reply with OK." "$ASK"
  report "$WORK/$sc.control.jsonl" "$dir" "$nonce" "control: a new session" 2
  printf '  versions served in the changed session: %s\n' "$(grep -ho 'SKILL-[A-Z]*-[A-Z0-9]*\(-v[12]\)\{0,1\}\|AGENT-[A-Z]*-[A-Z0-9]*\(-v[12]\)\{0,1\}' "$WORK/$sc.jsonl" | sort -u | tr '\n' ' ')"
  [[ -s "$WORK/$sc.jsonl.err" ]] && { echo "  stderr:"; head -5 "$WORK/$sc.jsonl.err" | sed 's/^/    /'; }
  [[ -n "${PROBE_KEEP:-}" ]] && { mkdir -p "$PROBE_KEEP"; cp -R "$WORK/." "$PROBE_KEEP/"; }
done
