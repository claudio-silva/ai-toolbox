#!/usr/bin/env bash
# Fixture tests for .crew/bin/crew and the dashboard model (.crew/dashboard/model.mjs, read
# through `server.mjs state`): compaction hooks, request queue, in-flight reminder,
# index-addition check, defect log, timing and sleep, keep-awake, stop state, and several leads
# (one per checkout: the conflict, take-over, per-set files, the backlog).
# Run from the skill directory: bash tests/hooks.sh
# Needs jq, git and Node.js 20+. Writes only under a temporary directory; caffeinate and sysctl
# are stubs; the dashboard server is never started (CREW_DASHBOARD=0).
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
T=$(mktemp -d "${TMPDIR:-/tmp}/crew-test.XXXXXX")
cleanup() {
  local pid
  local f
  for f in "$T/project/.crew/tmp/journal-state/keep-awake" "$T/project/.crew/tmp/journal-state/awake/"*; do
    [ -f "$f" ] || continue
    read -r pid _ < "$f"; kill "$pid" 2>/dev/null
  done
  pid=$(jq -r '.pid // empty' "$T/project/.crew/tmp/dashboard.json" 2>/dev/null)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  if [ -n "${CREW_CLAUDE_PID:-}" ]; then kill "$CREW_CLAUDE_PID" 2>/dev/null; wait "$CREW_CLAUDE_PID" 2>/dev/null; fi
  for pid in ${MORE_CLAUDES:-}; do kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; done
  rm -rf "$T"
}
trap cleanup EXIT

# ---- stubs: caffeinate sleeps; sysctl reports a fixed awake-time clock from a file ----
mkdir -p "$T/stubs"
printf '#!/bin/bash\n# caffeinate stub\nsleep 120\n' > "$T/stubs/caffeinate"
printf '#!/bin/sh\ncat "%s" 2>/dev/null\n' "$T/sysctl.out" > "$T/stubs/sysctl"
# ps: names the process FAKE_PASEO_PID "Paseo Daemon" (Paseo runs Claude Code), else the real ps.
cat > "$T/stubs/ps" <<'PS'
#!/bin/sh
if [ "$1 $2 $3" = "-o comm= -p" ] && [ -n "${FAKE_PASEO_PID:-}" ] && [ "$4" = "$FAKE_PASEO_PID" ]; then
  echo '/Applications/Paseo.app/Contents/MacOS/Paseo Daemon'; exit 0
fi
exec /bin/ps "$@"
PS
chmod +x "$T/stubs/caffeinate" "$T/stubs/sysctl" "$T/stubs/ps"
printf '24000000\n179643921385406 %s\n' $((24000000 * 5000)) > "$T/sysctl.out"   # awake: 5000 s
export PATH="$T/stubs:$PATH"
# Claude Code: a process whose command line says claude, standing in for the one the session runs in.
claude_stub() { bash -c 'exec -a claude-stub sleep 600' & CREW_CLAUDE_PID=$!; export CREW_CLAUDE_PID; }
# another_claude: one more Claude Code (its pid in REPLY), for a second lead.
MORE_CLAUDES=""
another_claude() { bash -c 'exec -a claude-stub sleep 600' & REPLY=$!; MORE_CLAUDES="$MORE_CLAUDES $REPLY"; }
claude_stub
unset CREW_KEEP_AWAKE PASEO_AGENT_ID PASEO_CLI CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN
export CREW_DASHBOARD=0
command -v node >/dev/null 2>&1 || { printf 'tests/hooks.sh needs Node.js 20 or later\n' >&2; exit 1; }
PASS=0; FAIL=0; TAB=$'\t'
ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
ko() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n      %s\n' "$1" "${2:-}"; }
check() {  # check NAME EXPECTED_SUBSTRING ACTUAL
  case $3 in *"$2"*) ok "$1" ;; *) ko "$1" "wanted: $2 | got: ${3:0:300}" ;; esac
}
check_not() {
  case $3 in *"$2"*) ko "$1" "did not want: $2 | got: ${3:0:300}" ;; *) ok "$1" ;; esac
}

# ---- project ----
P="$T/project"
mkdir -p "$P/.crew/bin" "$P/.crew/tasks/autosave" "$P/.claude/agents"
cp "$HERE/scaffold/bin/crew" "$P/.crew/bin/crew"; chmod +x "$P/.crew/bin/crew"
cp "$HERE/scaffold/queue.md" "$P/.crew/queue.md"
cp "$HERE/scaffold/defects.md" "$P/.crew/defects.md"
cp -R "$HERE/scaffold/dashboard" "$P/.crew/dashboard"
cp "$HERE/templates/agents/builder.md" "$P/.claude/agents/builder.md" 2>/dev/null || printf -- '---\nname: builder\nmodel: sonnet\neffort: high\n---\n' > "$P/.claude/agents/builder.md"
git -C "$P" init -q
cat > "$P/.crew/tasks/autosave/index.md" <<'IDX'
# Autosave — tasks

**Progress:** 1/3 accepted · now: T07 Autosave timer

| # | Status | Task | Flags | Depends on | Spec |
|---|---|---|---|---|---|
| T06 | accepted | Conflict banner | — | — | `06-banner.md` |
| T07 | in progress | Autosave timer | — | T06 | `07-timer.md` |
| T08 | pending | Autosave tests | — | T07 | `08-tests.md` |

## Facts
- none yet
IDX
printf '# T07 — Autosave timer\n\n**Flags:** none · **Depends on:** T06 · **Requests:** none\n' > "$P/.crew/tasks/autosave/07-timer.md"
printf '# T08 — Autosave tests\n\n**Flags:** none · **Depends on:** T07 · **Requests:** none\n' > "$P/.crew/tasks/autosave/08-tests.md"
CREW="$P/.crew/bin/crew"
export CLAUDE_PROJECT_DIR="$P"
cd "$P"

# ---- fake transcripts ----
SID=sess-0001
TR="$T/home/projects/slug"
mkdir -p "$TR/$SID/subagents"
MAIN="$TR/$SID.jsonl"
SUBID=a1b2c3d4e5f6
SUB="$TR/$SID/subagents/agent-$SUBID.jsonl"
NOWISO=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')
assistant() {  # assistant CONTEXT_TOKENS MSGID
  printf '{"type":"assistant","timestamp":"%s","message":{"id":"%s","usage":{"input_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":%s,"output_tokens":10}}}\n' "$NOWISO" "$2" "$1"
}
boundary() {  # boundary PRE POST DUR TRIGGER
  printf '{"type":"system","subtype":"compact_boundary","timestamp":"%s","compactMetadata":{"trigger":"%s","preTokens":%s,"postTokens":%s,"durationMs":%s,"cumulativeDroppedTokens":%s}}\n' "$NOWISO" "$4" "$1" "$2" "$3" "$1"
}
{ assistant 120000 msg_l1; assistant 265000 msg_l2; } > "$MAIN"

hook() {  # hook MODE JSON
  printf '%s' "$2" | "$CREW" hook "$1"
}
# model JQ: the dashboard model as JSON, through a jq filter. `span` and `k` format like the page.
JQ_DEFS='def span: if . == null then "—" else (round) as $s | if $s <= 0 then "—" elif $s < 60 then "\($s) s" elif $s < 3600 then "\(($s / 60) | floor) min" else "\(($s / 3600) | floor) h \((($s % 3600) / 60) | floor) min" end end;
def k: if . >= 1000 then "\((. / 1000) | round)k" else tostring end;'
model() {
  node "$P/.crew/dashboard/server.mjs" state --root "$P" | jq -r "$JQ_DEFS $1"
}
J_BASE="\"session_id\":\"$SID\",\"transcript_path\":\"$MAIN\",\"cwd\":\"$P\",\"hook_event_name\":\"x\""

# ---- session registration and lead model ----
"$CREW" session start "$SID" >/dev/null
out=$(hook session-start "{$J_BASE,\"source\":\"startup\",\"model\":\"claude-opus-5-5\",\"effort\":{\"level\":\"high\"}}")
check "session-start is silent" "" "x$out"
check "session-start records the lead model" "claude-opus-5-5 high" "$(cat "$P/.crew/tmp/journal-state/lead-model/$SID")"

# ---- the lead's way in, for the dashboard's messages ----
R="$P/.crew/tmp/journal-state/reach/$SID"
check "reach: nothing to record outside Claude Code's inbox and Paseo" "missing" "$([ -e "$R" ] && echo present || echo missing)"
CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc.sock CLAUDE_CODE_MESSAGING_TOKEN=tok1 PASEO_AGENT_ID=agent-1 PASEO_CLI=/opt/paseo \
  "$CREW" session start "$SID" >/dev/null
check "reach: socket and token; a Paseo id inherited by hand is not this session's" "/tmp/cc.sock${TAB}tok1${TAB}${TAB}" "$(cat "$R")"
check "reach: only this user reads it" "-rw-------" "$(ls -l "$R")"
FAKE_PASEO_PID=$$ CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc.sock CLAUDE_CODE_MESSAGING_TOKEN=tok2 PASEO_AGENT_ID=agent-1 PASEO_CLI=/opt/paseo \
  hook lead-busy "{$J_BASE,\"prompt\":\"hi\"}" >/dev/null
check "reach: Paseo's daemon runs it: its agent id and CLI" "/tmp/cc.sock${TAB}tok2${TAB}agent-1${TAB}/opt/paseo" "$(cat "$R")"
"$CREW" session start "$SID" >/dev/null
check "reach: a start without either keeps what was recorded" "agent-1" "$(cat "$R")"

# ---- 1. lead compaction (nothing running) ----
out=$(hook pre-compact "{$J_BASE,\"trigger\":\"auto\",\"custom_instructions\":\"\"}")
check "pre-compact (lead): custom instructions for the lead" "You are the lead of a crew" "$out"
check_not "pre-compact (lead): no subagent text" "If you are a subagent" "$out"
out=$(hook compact "{$J_BASE,\"source\":\"compact\",\"model\":\"claude-opus-5-5\"}")
check "compact (lead): conditional reminder" "If any of these are no longer in your context" "$out"
check "compact (lead): mentions the request rule" "queue first" "$out"
check_not "compact (lead): no subagent branch" "If you are a subagent" "$out"
# No boundary record yet: nothing journaled.
"$CREW" status >/dev/null
check_not "no boundary record: nothing journaled" "Context compacted" "$(cat "$P/.crew/journal.md" 2>/dev/null)"
# The record appears, then three turns.
{ boundary 266954 13810 57300 auto; assistant 14000 msg_l3; assistant 15000 msg_l4; assistant 16000 msg_l5; } >> "$MAIN"
"$CREW" status >/dev/null
line=$(grep 'Context compacted' "$P/.crew/journal.md" | tail -n 1)
check "lead compaction journaled" "system · Context compacted · lead (opus · high) · 267k → 14k · 57 s · auto · ≈\$0.33" "$line"
SAMPLE1=$line

# ---- 2. subagent compaction (builder running, larger context than the lead) ----
hook agent-start "{$J_BASE,\"tool_name\":\"Agent\",\"tool_input\":{\"subagent_type\":\"builder\",\"description\":\"T07 autosave timer\",\"model\":\"sonnet\",\"effort\":\"high\",\"name\":\"s2a-t07-builder\",\"run_in_background\":true}}" >/dev/null
hook agent-id "{$J_BASE,\"agent_id\":\"$SUBID\",\"agent_type\":\"builder\",\"agent_transcript_path\":\"$SUB\"}" >/dev/null
check "agent registered as running" "$SUBID" "$(ls "$P/.crew/tmp/journal-state/running")"
{ assistant 90000 msg_s1; assistant 166954 msg_s2; } > "$SUB"
printf '{"agentType":"builder","name":"s2a-t07-builder","model":"claude-sonnet-5-5","effort":"high","description":"T07 autosave timer"}\n' > "$TR/$SID/subagents/agent-$SUBID.meta.json"
out=$(hook pre-compact "{$J_BASE,\"trigger\":\"auto\",\"custom_instructions\":\"\"}")
check "pre-compact (sub): subagent instructions" "You are a subagent of a crew" "$out"
check_not "pre-compact (sub): never the lead's instructions" "lead of a crew" "$out"
out=$(hook compact "{$J_BASE,\"source\":\"compact\",\"model\":\"claude-sonnet-5-5\"}")
check "compact (sub): spec path in the reminder" "spec: .crew/tasks/autosave/07-timer.md" "$out"
check_not "compact (sub): no ListAgents, no queue" "ListAgents" "$out"
check_not "compact (sub): no lead branch" "If you are the lead" "$out"
{ boundary 166954 9800 41000 auto; assistant 10000 msg_s3; assistant 11000 msg_s4; } >> "$SUB"
"$CREW" status >/dev/null
line=$(grep 'Context compacted' "$P/.crew/journal.md" | tail -n 1)
check "subagent compaction journaled" "system · Context compacted · s2a-t07-builder (builder · sonnet · high) · 167k → 10k · 41 s · auto · ≈\$0.11" "$line"
SAMPLE2=$line

# ---- 3. model cross-check: pending says lead, the model says subagent ----
rm -f "$P/.crew/tmp/journal-state/running/"*
out=$(hook compact "{$J_BASE,\"source\":\"compact\",\"model\":\"claude-haiku-5-5\"}")
check "compact: a foreign model forces the subagent reminder" "If your task spec or brief is no longer in your context" "$out"
check_not "compact: a foreign model gets no lead text" "If any of these are no longer" "$out"

# ---- 4. unsure: two running agents with similar contexts ----
SUB2ID=f6e5d4c3b2a1
SUB2="$TR/$SID/subagents/agent-$SUB2ID.jsonl"
hook agent-start "{$J_BASE,\"tool_name\":\"Agent\",\"tool_input\":{\"subagent_type\":\"builder\",\"description\":\"T08 autosave tests\",\"name\":\"s2a-t08-builder\"}}" >/dev/null
hook agent-id "{$J_BASE,\"agent_id\":\"$SUB2ID\",\"agent_type\":\"builder\"}" >/dev/null
: > "$P/.crew/tmp/journal-state/running/$SUBID"
{ assistant 160000 msg_u1; } > "$SUB2"
{ assistant 165000 msg_u2; } > "$SUB"
out=$(hook pre-compact "{$J_BASE,\"trigger\":\"manual\"}")
check "pre-compact (unsure): neutral instructions" "if you are the main session" "$out"
out=$(hook compact "{$J_BASE,\"source\":\"compact\",\"model\":\"claude-opus-5-5\"}")
check "compact (unsure): subagent branch first" "If you are a subagent" "$out"
# No meta.json for the second agent: the label comes from the crew record.
{ boundary 165000 9000 30000 manual; } >> "$SUB2"
"$CREW" status >/dev/null
line=$(grep 'Context compacted' "$P/.crew/journal.md" | tail -n 1)
check "subagent without meta.json: label from the crew record" "s2a-t08-builder (builder · sonnet · medium) · 165k → 9k · 30 s · manual" "$line"
SAMPLE3=$line

# ---- 5. dashboard model ----
[ ! -e "$P/.crew/status.md" ] && ok "dashboard: no status.md is written" || ko "dashboard: no status.md is written" "found .crew/status.md"
out=$("$CREW" status)
check "status: CREW_DASHBOARD=0 keeps the server off" "Dashboard: off (CREW_DASHBOARD=0)" "$out"
out=$("$CREW" dashboard url); rc=$?
check "dashboard url: not running" "Dashboard: not running" "$out"
[ "$rc" -eq 1 ] && ok "dashboard url: exit 1 when not running" || ko "dashboard url: exit 1 when not running" "rc=$rc"
check "model: tasks and dependencies" "T06:accepted: T07:progress:T06 T08:pending:T07" \
  "$(model '.current.tasks | map("\(.id):\(.status):\(.deps | join(","))") | join(" ")')"
check "model: running agent on its task" "builder T07" "$(model '.agents[] | select(.id == "'"$SUBID"'") | "\(.type) \(.task)"')"
check "model: compaction counts" "lead 1 (at ~267k) · subagents 2 (at ~166k)" \
  "$(model '.compactions.summary | "lead \(.lead.count) (at ~\(.lead.avgPre | k)) · subagents \(.sub.count) (at ~\(.sub.avgPre | k))"')"
check "model: lead row with turns since" "lead (opus · high) | 267k → 14k | 57 s | auto | 3" \
  "$(model '.compactions.rows[] | select(.kind == "lead") | "\(.label) | \(.pre | k) → \(.post | k) | \(.durationMs / 1000 | span) | \(.trigger) | \(.turns)"')"

# ---- 6. requests ----
# A task set is open (autosave): requests go to its queue; the project's backlog is .crew/queue.md.
rm -f "$P/.crew/tmp/journal-state/running/"*
Q="$P/.crew/tasks/autosave/queue.md"
out=$("$CREW" request "Autosave every 10 s, not only on blur" --affects "T07, T08" --slot "after T07")
check "request: entry printed" "- [R1] $(date '+%Y-%m-%d') · Autosave every 10 s, not only on blur · affects: T07, T08 · slot: after T07 · status: queued" "$out"
check "request: journaled, with its set" "lead · Queued R1 (set autosave): Autosave every 10 s, not only on blur, slot: after T07" "$(tail -n 1 "$P/.crew/journal.md")"
check "request: in the open set's queue" "- [R1] " "$(cat "$Q")"
check_not "request: not in the backlog" "- [R1] " "$(grep -E '^- \[R' "$P/.crew/queue.md")"
"$CREW" request "Rename Save to Guardar" --urgent >/dev/null
"$CREW" request "Export to EPUB" --slot "milestone 3" >/dev/null
check "request: urgent goes first" "- [R2] " "$(grep -m 1 -E '^- \[R' "$Q")"
check "request: urgent slot" "slot: now (urgent) · status: queued" "$(grep -E '^- \[R2\]' "$Q")"
out=$("$CREW" request "Dry run only" --dry-run)
check "request: dry run prints R4" "- [R4] " "$out"
check_not "request: dry run writes nothing" "Dry run only" "$(cat "$Q")"
out=$("$CREW" request R1 --status scheduled --note "as T09")
check "request: transition rewrites the line" "status: scheduled" "$out"
check "request: transition journaled" "Scheduled R1 (Autosave every 10 s, not only on blur) as T09" "$(tail -n 1 "$P/.crew/journal.md")"
"$CREW" request R2 --status done >/dev/null
check "request: done" "[R2] " "$(grep 'status: done' "$Q")"
out=$("$CREW" request R9 --status done 2>&1); rc=$?
check "request: unknown id fails" "no entry R9" "$out"
check "queue keeps the questions section" "## Questions for the founder" "$(cat "$Q")"
rq=$(grep -c -E '^- \[R[0-9]+\]' "$Q")
check "queue has three entries" "3" "$rq"
"$CREW" request "Dark mode" --slot "milestone 3" >/dev/null
out=$("$CREW" request "Print preview" --backlog)
check "request: --backlog numbers on, project-wide" "- [R5] " "$out"
check "request: --backlog writes the project's queue" "- [R5] " "$(cat "$P/.crew/queue.md")"
check "request: --backlog journaled" "Queued R5 (backlog)" "$(tail -n 1 "$P/.crew/journal.md")"
"$CREW" request R5 --status dropped >/dev/null
check "request: a transition finds a backlog entry" "status: dropped" "$(grep -F '[R5]' "$P/.crew/queue.md")"
check "model: requests and their states" "R2 done · R1 scheduled · R3 queued · R4 queued · R5 dropped" \
  "$(model '.queue.requests | map("\(.id) \(.state)") | join(" · ")')"
check "model: where each request is kept" "R1 autosave · R5 backlog" \
  "$(model '.queue.requests | map(select(.id == "R1" or .id == "R5")) | map("\(.id) \(.set // "backlog")") | join(" · ")')"
check "model: request columns" "R1 | Autosave every 10 s, not only on blur | T07, T08 | after T07 | scheduled" \
  "$(model '.queue.requests[] | select(.id == "R1") | "\(.id) | \(.text) | \(.affects) | \(.slot) | \(.state)"')"
check "model: request counts" "queued 2 · scheduled 1 · done 1 · dropped 1" \
  "$(model '.queue.counts | "queued \(.queued) · scheduled \(.scheduled) · done \(.done) · dropped \(.dropped)"')"

# ---- 7. in-flight reminder ----
out=$(hook lead-busy "{$J_BASE,\"prompt\":\"hi\"}")
check "lead-busy: in-flight reminder names the rows" "work is in flight (T07 in progress; 0 agent(s) running)" "$out"
sed -i.bak 's/| T07 | in progress |/| T07 | accepted |/' "$P/.crew/tasks/autosave/index.md"
out=$(hook lead-busy "{$J_BASE,\"prompt\":\"hi\"}")
check_not "lead-busy: silent when nothing is in flight" "in flight" "$out"
out=$(hook lead-busy "{$J_BASE,\"prompt\":\"hi\",\"agent_type\":\"builder\",\"agent_id\":\"zzz\"}")
check_not "lead-busy: silent inside a subagent" "Crew" "$out"

# ---- 8. index additions without Requests: ----
hook file-changed "{$J_BASE,\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$P/.crew/tasks/autosave/index.md\"}}" >/dev/null
printf '# T09 — Guardar\n\n**Flags:** none · **Depends on:** —\n' > "$P/.crew/tasks/autosave/09-guardar.md"
printf '| T09 | pending | Guardar button | — | — | `09-guardar.md` |\n' >> "$P/.crew/tasks/autosave/index.md"
out=$(hook file-changed "{$J_BASE,\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$P/.crew/tasks/autosave/index.md\"}}")
check "index addition: flagged to the lead" "T09 added to .crew/tasks/autosave/index.md without a Requests: line" "$out"
check "index addition: additionalContext JSON" "\"hookEventName\":\"PostToolUse\"" "$out"
check "index addition: journaled" "system · T09 added to" "$(tail -n 1 "$P/.crew/journal.md")"
out=$(hook file-changed "{$J_BASE,\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$P/.crew/tasks/autosave/index.md\"}}")
check_not "index addition: flagged once" "T09 added" "$out"

# ---- 9. defects ----
DF="$P/.crew/tasks/autosave/defects.md"
out=$("$CREW" defect "Ribbon icon sits 2 px low" --where "ribbon (app/src/ribbon.tsx)" --from "T07 review")
check "defect: entry printed" "- [D1] $(date '+%Y-%m-%d') · Ribbon icon sits 2 px low · where: ribbon (app/src/ribbon.tsx) · from: T07 review · severity: low · slot: end of set · status: deferred" "$out"
check "defect: in the open set's log, under its heading" "## Defects

- [D1]" "$(cat "$DF")"
check "defect: journaled" "lead · Deferred D1 (low): Ribbon icon sits 2 px low, where: ribbon (app/src/ribbon.tsx)" "$(tail -n 1 "$P/.crew/journal.md")"
out=$("$CREW" defect "Text lost on reload" --where editor --severity high 2>&1); rc=$?
check "defect: high severity refused" "never deferred" "$out"
[ "$rc" -ne 0 ] && ok "defect: high severity exits non-zero" || ko "defect: high severity exits 0"
out=$("$CREW" defect "No where" 2>&1)
check "defect: --where required" "--where is required" "$out"
"$CREW" defect "Offline save shows a raw error code" --where "save state (app/src/save-state.tsx)" --severity medium --from "T08 review" >/dev/null
check "model: deferred defects counted" "deferred 2 (medium 1)" "$(model '.defects.summary | "deferred \(.deferred) (medium \(.deferredMedium))"')"
out=$("$CREW" defect D1 --status fixed --promote 2>&1)
check "defect: --promote only with scheduled" "goes with --status scheduled" "$out"
out=$("$CREW" defect D1 --promote --note "it broke T09's ribbon screenshot check")
check "defect: promoted" "status: scheduled · promoted" "$out"
check "defect: promotion journaled" "Promoted D1 (Ribbon icon sits 2 px low): it broke T09's ribbon screenshot check" "$(tail -n 1 "$P/.crew/journal.md")"
check "defect: note kept on the line, last" "· promoted · note: it broke T09's ribbon screenshot check" "$(grep -F '[D1]' "$DF")"
"$CREW" defect D2 --status scheduled --note 'as T10 \ & co' >/dev/null
check "defect: note taken literally" "· status: scheduled · note: as T10 \\ & co" "$(grep -F '[D2]' "$DF")"
"$CREW" defect D2 --status fixed >/dev/null
check "defect: older note kept by a transition without one" "· status: fixed · note: as T10 \\ & co" "$(grep -F '[D2]' "$DF")"
"$CREW" defect D2 --status fixed --note "in T10" >/dev/null
check "defect: fixed journaled" "Fixed D2 (Offline save shows a raw error code): in T10" "$(tail -n 1 "$P/.crew/journal.md")"
check "model: defect note" "D2 fixed · in T10" "$(model '.defects.items[] | select(.id == "D2") | "\(.id) \(.state) · \(.note)"')"
check "model: defects summary" "deferred 0 · scheduled 1 · fixed 1 · dropped 0 · promoted 1 of 2" \
  "$(model '.defects.summary | "deferred \(.deferred) · scheduled \(.scheduled) · fixed \(.fixed) · dropped \(.dropped) · promoted \(.promoted) of \(.total)"')"
check "model: open defect, promoted" "D1 | Ribbon icon sits 2 px low | ribbon (app/src/ribbon.tsx) | T07 review | low | end of set | scheduled (promoted)" \
  "$(model '.defects.items[] | select(.id == "D1") | "\(.id) | \(.text) | \(.where) | \(.from) | \(.severity) | \(.slot) | \(.state)\(if .promoted then " (promoted)" else "" end)"')"
check "model: fixed defect" "D2 fixed" "$(model '.defects.items[] | select(.id == "D2") | "\(.id) \(.state)"')"

# ---- 10. runs, sleep and the Timing section ----
S="$P/.crew/tmp/journal-state"
RUNID=c0ffee000001
hook agent-start "{$J_BASE,\"tool_name\":\"Agent\",\"tool_input\":{\"subagent_type\":\"builder\",\"description\":\"T09 Guardar button\",\"name\":\"t09-builder\"}}" >/dev/null
hook agent-id "{$J_BASE,\"agent_id\":\"$RUNID\",\"agent_type\":\"builder\"}" >/dev/null
hook agent-stop "{$J_BASE,\"agent_id\":\"$RUNID\",\"agent_type\":\"builder\",\"last_assistant_message\":\"DONE\\nall green\"}" >/dev/null
check "run: first run recorded" "	$RUNID	builder	9	first	DONE" "$(cat "$S/runs.tsv")"
hook agent-id "{$J_BASE,\"agent_id\":\"$RUNID\",\"agent_type\":\"builder\"}" >/dev/null
hook agent-stop "{$J_BASE,\"agent_id\":\"$RUNID\",\"agent_type\":\"builder\",\"last_assistant_message\":\"DONE\"}" >/dev/null
check "run: a resume is its own run" "$RUNID	builder	9	resume	DONE" "$(cat "$S/runs.tsv")"
# Sleep: the wall clock moved 3700 s further than the awake clock since the last sample.
now=$(date +%s)
printf '%s 5000\n' $((now - 3700)) > "$S/clock"
"$CREW" status >/dev/null
check "sleep: journaled" "system · The computer slept 1 h 1 min between" "$(cat "$P/.crew/journal.md")"
check "sleep: logged" "$((now - 3700))	" "$(cat "$S/sleep.tsv")"
"$CREW" status >/dev/null
check "sleep: logged once" "1" "$(wc -l < "$S/sleep.tsv" | tr -d ' ')"
# A known set: the index committed two hours ago; T09 runs beside T07, and one sleep falls
# inside both of their builds.
git -C "$P" add .crew/tasks/autosave/index.md >/dev/null
GIT_COMMITTER_DATE="$(date -r $((now - 7200)) '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -d "@$((now - 7200))" '+%Y-%m-%dT%H:%M:%S')" \
  git -C "$P" -c user.name=t -c user.email=t@t commit -q -m "Plan autosave"
b=$((now - 7000))
{
  printf '%s\t%s\tb6\tbuilder\t6\tfirst\tDONE\n' $b $((b + 600))
  printf '%s\t%s\tr6\treviewer\t6\tfirst\tCHANGES\n' $((b + 600)) $((b + 900))
  printf '%s\t%s\tb6\tbuilder\t6\tresume\tDONE\n' $((b + 900)) $((b + 1200))
  printf '%s\t%s\tr6\treviewer\t6\tresume\tACCEPT\n' $((b + 1200)) $((b + 1320))
  printf '%s\t%s\tb7\tbuilder\t7\tfirst\tDONE\n' $((b + 1400)) $((b + 2600))
  printf '%s\t%s\tr7\treviewer\t7\tfirst\tACCEPT\n' $((b + 2600)) $((b + 2900))
  printf '%s\t%s\tb9\tbuilder\t9\tfirst\tDONE\n' $((b + 1400)) $((b + 2000))
  printf '%s\t%s\tq1\tqa\t\tfirst\tDONE\n' $((b + 3000)) $((b + 3240))
} > "$S/runs.tsv"
printf '%s\t%s\t400\n' $((b + 1500)) $((b + 2000)) > "$S/sleep.tsv"
# The lead works 2 min before the first run and on into it (agents' time from then), and 5 min
# alone after the QA run; then it waits.
printf '%s\tworking\n%s\tidle\n%s\tworking\n%s\tidle\n' $((b - 120)) $((b + 100)) $((b + 3240)) $((b + 3540)) > "$S/lead.tsv"
"$CREW" status >/dev/null
tm() { model ".current.timing | $1"; }
check "timing: set start from the commit that added the index" "$((now - 7200))" "$(tm '.start')"
check "timing: clock line" "slept 6 min · agents at work 44 min · lead alone 7 min · crew at work 51 min · idle 1 h 2 min" \
  "$(tm '"slept \(.slept | span) · agents at work \(.busy | span) · lead alone \(.leadAlone | span) · crew at work \(.active | span) · idle \(.idle | span)"')"
check "timing: phase split" "Task time 43 min: build 26 min · review 12 min · rework 5 min · CHANGES verdicts 1" \
  "$(tm '"Task time \(.taskTime | span): build \(.phases.build | span) · review \(.phases.review | span) · rework \(.phases.rework | span) · CHANGES verdicts \(.changes)"')"
check "timing: critical path and headroom" "T06 → T07 · 40 min · parallel headroom 3 min" \
  "$(tm '"\(.criticalPath.ids | join(" → ")) · \(.criticalPath.seconds | span) · parallel headroom \(.criticalPath.headroom | span)"')"
rows=$(tm '.perTask[] | "\(.id) | \(.build | span) | \(.review | span) | \(.rework | span) | \(if .changes > 0 then .changes else "—" end) | \(.active | span) | \(.slept | span)"')
check "timing: a sleep pauses every run it falls in" "T09 | 3 min | — | — | — | 3 min | 6 min" "$rows"
check "timing: T06 row" "T06 | 10 min | 7 min | 5 min | 1 | 22 min | —" "$rows"
check "timing: T07 row, sleep left out" "T07 | 13 min | 5 min | — | — | 18 min | 6 min" "$rows"
check "timing: set-level row" "Set level (qa) | 4 min | —" "$(tm '.setLevel | "Set level (\(.types | join(", "))) | \(.active | span) | \(.slept | span)"')"
check "timing: open set, clock runs" "done=false until=null" "$(tm '"done=\(.done) until=\(.until)"')"
# A finished set: every task accepted and nothing running stops the clock at the last run's end.
cp "$P/.crew/tasks/autosave/index.md" "$T/index.keep"
sed -i.bak -E 's/^\| (T[0-9]+) \| [a-z ]+ \|/| \1 | accepted |/' "$P/.crew/tasks/autosave/index.md"
check "timing: a finished set stops the clock" "until $((b + 3240)): 57 min on the clock · slept 6 min · agents at work 44 min · lead alone 2 min · idle 4 min" \
  "$(tm '"until \(.until): \(.clock | span) on the clock · slept \(.slept | span) · agents at work \(.busy | span) · lead alone \(.leadAlone | span) · idle \(.idle | span)"')"
cp "$T/index.keep" "$P/.crew/tasks/autosave/index.md"

# ---- 11. keep awake, stop ----
check "keep awake: on after session start" "on=true" "$(model '.keepAwake | "on=\(.on)"')"
read -r kpid _ < "$S/awake/$SID"
"$CREW" session stop >/dev/null
sleep 0.2
kill -0 "$kpid" 2>/dev/null && ko "keep awake: stopped with the crew" "pid $kpid still running" || ok "keep awake: stopped with the crew"
check "keep awake: off when stopped" "on=false stopped=true" "$(model '.keepAwake | "on=\(.on) stopped=\(.stopped)"')"
check "session stop: lead state" "stopped since " "$(model '.lead | "\(.state) since \(.since)"')"
hook lead-idle "{$J_BASE}" >/dev/null
check "session stop: survives the lead's Stop event" "stopped" "$(model '.lead.state')"
hook lead-busy "{$J_BASE,\"prompt\":\"unrelated question\"}" >/dev/null
check "session stop: survives an unrelated founder prompt" "stopped" "$(model '.lead.state')"
"$CREW" session start "$SID" >/dev/null
check "session stop: cleared by session start (/crew resume), which the lead is running" "working" "$(model '.lead.state')"
hook lead-busy "{$J_BASE,\"prompt\":\"go on\"}" >/dev/null
check "lead state: working after a prompt" "working since" "$(model '.lead | "\(.state) since \(.since)"')"
check "lead log: state changes in lead.tsv, not the ones a stop keeps out" "stopped working " "$(tail -n 2 "$S/lead.tsv" | cut -f 2 | tr '\n' ' ')"
check "lead state: the epoch it started at, for the page's clock" "recent" "$(model '.lead | if (.sinceEpoch // 0) > (now - 120) then "recent" else "sinceEpoch \(.sinceEpoch)" end')"
[ ! -e "$P/.crew/status.md" ] && ok "dashboard: still no status.md" || ko "dashboard: still no status.md" "found .crew/status.md"

# ---- 11b. the dashboard announce: a real server, on the project's own port ----
# Every session start ends with the dashboard's link, whoever started the server.
if command -v node >/dev/null 2>&1; then
  export CREW_DASHBOARD=1
  out=$("$CREW" session start "$SID")
  check "session start: ends with the dashboard's link" "Dashboard: [http://" "$(printf '%s\n' "$out" | tail -n 1)"
  check "session start: a Markdown link, the URL as its text" "](http://" "$out"
  out=$("$CREW" session start "$SID")
  check "session start: the link when the dashboard already runs" "Dashboard: [http://" "$out"
  out=$("$CREW" dashboard start); rc=$?
  [ "$rc" -eq 3 ] && [ -z "$out" ] && ok "dashboard start: exit 3 and no output when it runs" || ko "dashboard start: exit 3 and no output when it runs" "rc=$rc out=$out"
  "$CREW" dashboard stop >/dev/null
  hook session-start "{$J_BASE,\"source\":\"startup\",\"model\":\"claude-opus-5-5\",\"effort\":{\"level\":\"high\"}}" >/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do "$CREW" dashboard url >/dev/null && break; sleep 0.3; done
  out=$("$CREW" session start "$SID")
  check "session start: the link when its SessionStart hook started the dashboard" "Dashboard: [http://" "$out"
  "$CREW" dashboard stop >/dev/null
  export CREW_DASHBOARD=0
fi

# ---- 11c. Claude Code quits: the subagents running in it are not running any more ----
hook agent-id "{$J_BASE,\"agent_id\":\"orph1\",\"agent_type\":\"builder\"}" >/dev/null
check "running agent: the session that runs it" "$SID" "$(cat "$S/running/orph1")"
check "Claude Code running: the agent runs" "working 1" "$(model '"\(.lead.state) \(.agents | length)"')"
kill "$CREW_CLAUDE_PID"; wait "$CREW_CLAUDE_PID" 2>/dev/null
check "Claude Code gone: the lead is closed, nothing runs" "closed 0" "$(model '"\(.lead.state) \(.agents | length)"')"
check "Claude Code gone: the run ended, interrupted" "interrupted false" "$(model '.current.timing.runs | map(select(.agentId == "orph1")) | .[0] | "\(.status) \(.open)"')"
claude_stub
"$CREW" session start "$SID" >/dev/null
check "session start: records the orphaned run as interrupted" "	orph1	builder	" "$(grep interrupted "$S/runs.tsv")"
[ ! -e "$S/running/orph1" ] && ok "session start: clears the orphaned run" || ko "session start: clears the orphaned run" "running/orph1 still there"
check "session start: journals it" "interrupted" "$(grep '← builder' "$P/.crew/journal.md" | tail -n 1)"
check "session start: records the new process" "$CREW_CLAUDE_PID" "$(cat "$S/claude/$SID")"

# ---- 11d. several leads: one per checkout ----
# A second session in the same checkout is refused; it may take over, not while the first runs
# agents. A session in another checkout (a worktree) leads the task set open there, with its own
# queue and defect log; numbers stay project-wide.
another_claude; C2=$REPLY
out=$(CREW_CLAUDE_PID=$C2 "$CREW" session start sess-0002); rc=$?
[ "$rc" -eq 4 ] && ok "second lead, same checkout: exit 4" || ko "second lead, same checkout: exit 4" "rc=$rc"
check "second lead, same checkout: names the lead and the choices" "another session already leads the main checkout" "$out"
check "second lead, same checkout: offers the take-over" "session start sess-0002 --take-over" "$out"
[ ! -e "$S/sessions/sess-0002" ] && ok "second lead, same checkout: not registered" || ko "second lead, same checkout: not registered" "sessions/sess-0002 exists"
hook agent-id "{$J_BASE,\"agent_id\":\"busy1\",\"agent_type\":\"builder\"}" >/dev/null
out=$(CREW_CLAUDE_PID=$C2 "$CREW" session start sess-0002 --take-over); rc=$?
[ "$rc" -eq 4 ] && ok "take-over: refused while the lead runs agents" || ko "take-over: refused while the lead runs agents" "rc=$rc"
check "take-over: says why" "runs 1 subagent(s)" "$out"
rm -f "$S/running/busy1"
out=$(CREW_CLAUDE_PID=$C2 "$CREW" session start sess-0002 --take-over 2>"$P/.crew/tmp/err"); rc=$?
check "take-over: registered" "Crew session registered: sess-0002" "$out"
# A session's first start reads state files it has none of yet (claude/, leads/): quietly.
[ ! -s "$P/.crew/tmp/err" ] && ok "take-over: a new session's first start writes nothing to stderr" || ko "take-over: a new session's first start writes nothing to stderr" "$(cat "$P/.crew/tmp/err")"
check "take-over: journaled" "Took over the lead of this checkout from session $SID" "$(cat "$P/.crew/journal.md")"
[ -e "$S/superseded/$SID" ] && ok "take-over: the old lead is superseded" || ko "take-over: the old lead is superseded" "no superseded/$SID"
out=$(hook lead-busy "{$J_BASE,\"prompt\":\"carry on\"}")
check "superseded lead: told at its next prompt" "no longer the crew's lead" "$out"
# /crew runs only when it opens the message: elsewhere the skill did not run, and the lead says so.
out=$(hook lead-busy "{$J_BASE,\"prompt\":\"O skill foi actualizado: /crew\\nfaz isto\"}")
check "/crew mid-message: the lead only tells the founder how to run it" "but not at its start" "$out"
for pr in '/crew setup' 'corri `/crew setup` e falhou' 'corre .crew/bin/crew status' 'The founder, from the Crew dashboard: run /crew resume now, as if they had typed it.'; do
  out=$(hook lead-busy "$(jq -nc --arg p "$pr" --arg s "$SID" --arg t "$MAIN" --arg c "$P" '{session_id:$s,transcript_path:$t,cwd:$c,hook_event_name:"x",prompt:$p}')")
  case $out in *"not at its start"*) ko "/crew mid-message: not for: $pr" "$out" ;; *) ok "/crew mid-message: not for: $pr" ;; esac
done
nj=$(grep -c 'Took over' "$P/.crew/journal.md")
out=$(CREW_CLAUDE_PID=$C2 "$CREW" session start sess-0003); rc=$?
[ "$rc" -eq 0 ] && ok "/clear (same Claude Code, new session): no conflict" || ko "/clear (same Claude Code, new session): no conflict" "rc=$rc $out"
check "/clear: not a take-over" "$nj" "$(grep -c 'Took over' "$P/.crew/journal.md")"
out=$(CREW_CLAUDE_PID=$C2 "$CREW" where)
check "where: the set this lead's files belong to" "Task set: autosave" "$out"
check "lead log: session and set columns" "sess-0003${TAB}autosave" "$(tail -n 1 "$S/lead.tsv" | cut -f 3,4)"

W="$T/wt"
git -C "$P" worktree add -q "$W" -b crew/export 2>/dev/null
mkdir -p "$W/.crew/tasks/export"
printf '# Export — tasks\n\n| # | Status | Task | Flags | Depends on | Spec |\n|---|---|---|---|---|---|\n| T01 | pending | PDF export | — | — | `01-pdf.md` |\n' > "$W/.crew/tasks/export/index.md"
another_claude; C3=$REPLY
cd "$W"
out=$(CREW_CLAUDE_PID=$C3 "$CREW" session start sess-0004); rc=$?
[ "$rc" -eq 0 ] && ok "lead in a worktree: registered beside the main checkout's" || ko "lead in a worktree: registered beside the main checkout's" "rc=$rc $out"
check "lead in a worktree: its task set" "Task set: export" "$out"
out=$(CREW_CLAUDE_PID=$C3 "$CREW" request "Export as PDF/A")
check "lead in a worktree: request numbers stay project-wide" "- [R6] " "$out"
check "lead in a worktree: the request is in its set's queue" "- [R6] " "$(cat "$W/.crew/tasks/export/queue.md" 2>/dev/null)"
out=$(CREW_CLAUDE_PID=$C3 "$CREW" defect "Margins off by 1 mm" --where "pdf export")
check "lead in a worktree: defect numbers stay project-wide" "- [D3] " "$out"
check "model: one lead per checkout" "2: main checkout, wt" "$(model '.roster.leads | "\(length): \(map(.label) | join(", "))"')"
check "model: both open sets" "autosave export" "$(model '.open | map(.slug) | sort | join(" ")')"
check "model: entries carry their set" "R6 export · D3 export" "$(model '[(.queue.requests[] | select(.id == "R6")), (.defects.items[] | select(.id == "D3"))] | map("\(.id) \(.set)") | join(" · ")')"
check "model: a worktree lead's journal lines carry its set" "export" "$(model '[.journal.entries[] | select(.branch == "crew/export") | .set] | unique | join(" ")')"
check "model: the main checkout's lines, its set" "autosave" "$(model '[.journal.entries[] | select(.branch == "") | .set] | map(. // "none") | unique | join(" ")')"
hook agent-id "{\"session_id\":\"sess-0004\",\"transcript_path\":\"$MAIN\",\"cwd\":\"$W\",\"hook_event_name\":\"x\",\"agent_id\":\"wt1\",\"agent_type\":\"builder\"}" >/dev/null
check "running: a lead sees its own agents" "wt1" "$(CREW_CLAUDE_PID=$C3 "$CREW" running)"
check_not "running: not the other lead's" "wt1" "$(CREW_CLAUDE_PID=$C2 "$CREW" running)"
check "running --all: every lead's, with the session" "session sess-0004" "$(CREW_CLAUDE_PID=$C2 "$CREW" running --all)"
rm -f "$S/running/wt1"
out=$(CREW_CLAUDE_PID=$C3 "$CREW" carry)
check "carry: open entries move to the backlog" "Moved to the backlog" "$out"
check "carry: the request is in the worktree's backlog" "- [R6] " "$(cat "$W/.crew/queue.md" 2>/dev/null)"
check_not "carry: and no longer in the set's queue" "- [R6] " "$(cat "$W/.crew/tasks/export/queue.md")"
out=$(CREW_CLAUDE_PID=$C3 "$CREW" session stop)
check "session stop: the caller's lead only" "stopped" "$(model '.roster.leads[] | select(.session == "sess-0004") | .state.state')"
check "session stop: the other lead carries on" "working" "$(model '.roster.leads[] | select(.session == "sess-0003") | .state.state')"
cd "$P"

# ---- 11e. crew reload: Paseo reloads the session once its turn ends; elsewhere, the founder ----
out=$("$CREW" reload 2>&1); rc=$?
[ "$rc" -eq 2 ] && ok "reload outside Paseo: exit 2" || ko "reload outside Paseo: exit 2" "rc=$rc"
check "reload outside Paseo: what the founder does" "/exit, then claude --continue" "$out"
printf '#!/bin/sh\necho "$*" >> "%s"\n' "$T/paseo.log" > "$T/stubs/paseo-cli"; chmod +x "$T/stubs/paseo-cli"
out=$(FAKE_PASEO_PID=$$ PASEO_AGENT_ID=agent-1 PASEO_CLI="$T/stubs/paseo-cli" "$CREW" reload); rc=$?
[ "$rc" -eq 0 ] && ok "reload in Paseo: scheduled" || ko "reload in Paseo: scheduled" "rc=$rc $out"
check "reload in Paseo: says when" "when this turn ends" "$out"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do grep -q '^send' "$T/paseo.log" 2>/dev/null && break; sleep 0.1; done
check "reload in Paseo: waits for the turn, reloads, then sends the note" \
  "wait agent-1 --timeout 1800|agent reload agent-1|send agent-1 --prompt This session ran crew reload" "$(tr '\n' '|' < "$T/paseo.log" 2>/dev/null)"

# ---- 12. hooks never fail ----
printf 'not json' | "$CREW" hook compact >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok "garbage input: exit 0" || ko "garbage input: exit $rc"
printf '{}' | "$CREW" hook pre-compact >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && ok "empty object: exit 0" || ko "empty object: exit $rc"
out=$(printf '{"session_id":"other","transcript_path":"/nope"}' | "$CREW" hook compact)
check_not "unregistered session: silent" "Crew" "$out"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
printf '\nSample journal lines:\n%s\n%s\n%s\n' "$SAMPLE1" "$SAMPLE2" "$SAMPLE3"
[ "${KEEP:-0}" = 1 ] && { trap - EXIT; printf '\nkept: %s\n' "$T"; }
[ "$FAIL" -eq 0 ]
