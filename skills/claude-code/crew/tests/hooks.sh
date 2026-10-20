#!/usr/bin/env bash
# Fixture tests for .crew/bin/crew: compaction hooks, request queue, in-flight reminder,
# index-addition check, defect log, timing and sleep, keep-awake, stop state.
# Run from the skill directory: bash tests/hooks.sh
# Needs jq and git. Writes only under a temporary directory; caffeinate and sysctl are stubs.
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
T=$(mktemp -d "${TMPDIR:-/tmp}/crew-test.XXXXXX")
cleanup() {
  local pid
  if [ -f "$T/project/.crew/tmp/journal-state/keep-awake" ]; then
    read -r pid _ < "$T/project/.crew/tmp/journal-state/keep-awake"; kill "$pid" 2>/dev/null
  fi
  rm -rf "$T"
}
trap cleanup EXIT

# ---- stubs: caffeinate sleeps; sysctl reports a fixed awake-time clock from a file ----
mkdir -p "$T/stubs"
printf '#!/bin/bash\n# caffeinate stub\nsleep 120\n' > "$T/stubs/caffeinate"
printf '#!/bin/sh\ncat "%s" 2>/dev/null\n' "$T/sysctl.out" > "$T/stubs/sysctl"
chmod +x "$T/stubs/caffeinate" "$T/stubs/sysctl"
printf '24000000\n179643921385406 %s\n' $((24000000 * 5000)) > "$T/sysctl.out"   # awake: 5000 s
export PATH="$T/stubs:$PATH"
unset CREW_KEEP_AWAKE
PASS=0; FAIL=0
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
J_BASE="\"session_id\":\"$SID\",\"transcript_path\":\"$MAIN\",\"cwd\":\"$P\",\"hook_event_name\":\"x\""

# ---- session registration and lead model ----
"$CREW" session start "$SID" >/dev/null
out=$(hook session-start "{$J_BASE,\"source\":\"startup\",\"model\":\"claude-opus-5-5\",\"effort\":{\"level\":\"high\"}}")
check "session-start is silent" "" "x$out"
check "session-start records the lead model" "claude-opus-5-5 high" "$(cat "$P/.crew/tmp/journal-state/lead-model/$SID")"

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

# ---- 5. dashboard ----
st=$(cat "$P/.crew/status.md")
check "dashboard: compaction counts" "**Compactions:** lead 1 · subagents 2" "$st"
check "dashboard: tasks flow top-down" "flowchart TD" "$st"
check "dashboard: Compactions section" "## Compactions" "$st"
check "dashboard: lead row with turns since" "| lead (opus · high) | 267k → 14k | 57 s | auto | 3 |" "$st"
check "dashboard: summary line" "lead: 1 (at ~267k tokens) · subagents: 2 (at ~166k tokens" "$st"

# ---- 6. requests ----
rm -f "$P/.crew/tmp/journal-state/running/"*
out=$("$CREW" request "Autosave every 10 s, not only on blur" --affects "T07, T08" --slot "after T07")
check "request: entry printed" "- [R1] $(date '+%Y-%m-%d') · Autosave every 10 s, not only on blur · affects: T07, T08 · slot: after T07 · status: queued" "$out"
check "request: journaled" "lead · Queued R1: Autosave every 10 s, not only on blur, slot: after T07" "$(tail -n 1 "$P/.crew/journal.md")"
"$CREW" request "Rename Save to Guardar" --urgent >/dev/null
"$CREW" request "Export to EPUB" --slot "milestone 3" >/dev/null
check "request: urgent goes first" "- [R2] " "$(grep -m 1 -E '^- \[R' "$P/.crew/queue.md")"
check "request: urgent slot" "slot: now (urgent) · status: queued" "$(grep -E '^- \[R2\]' "$P/.crew/queue.md")"
out=$("$CREW" request "Dry run only" --dry-run)
check "request: dry run prints R4" "- [R4] " "$out"
check_not "request: dry run writes nothing" "Dry run only" "$(cat "$P/.crew/queue.md")"
out=$("$CREW" request R1 --status scheduled --note "as T09")
check "request: transition rewrites the line" "status: scheduled" "$out"
check "request: transition journaled" "Scheduled R1 (Autosave every 10 s, not only on blur) as T09" "$(tail -n 1 "$P/.crew/journal.md")"
"$CREW" request R2 --status done >/dev/null
check "request: done" "[R2] " "$(grep 'status: done' "$P/.crew/queue.md")"
out=$("$CREW" request R9 --status done 2>&1); rc=$?
check "request: unknown id fails" "no entry R9" "$out"
check "queue keeps the questions section" "## Questions for the founder" "$(cat "$P/.crew/queue.md")"
rq=$(grep -c -E '^- \[R[0-9]+\]' "$P/.crew/queue.md")
check "queue has three entries" "3" "$rq"
"$CREW" request "Dark mode" --slot "milestone 3" >/dev/null
check "dashboard: column entries chained" "R3 ~~~ R4" "$(cat "$P/.crew/status.md")"
"$CREW" status >/dev/null
check "dashboard: request queues side by side" "flowchart LR
  subgraph Queued
    direction TB" "$(cat "$P/.crew/status.md")"
check "dashboard: queues in order" "  Queued ~~~ Scheduled ~~~ Done" "$(cat "$P/.crew/status.md")"

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
check "index addition: flagged to the lead" "T09 added to tasks/autosave/index.md without a Requests: line" "$out"
check "index addition: additionalContext JSON" "\"hookEventName\":\"PostToolUse\"" "$out"
check "index addition: journaled" "system · T09 added to" "$(tail -n 1 "$P/.crew/journal.md")"
out=$(hook file-changed "{$J_BASE,\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$P/.crew/tasks/autosave/index.md\"}}")
check_not "index addition: flagged once" "T09 added" "$out"

# ---- 9. defects ----
out=$("$CREW" defect "Ribbon icon sits 2 px low" --where "ribbon (app/src/ribbon.tsx)" --from "T07 review")
check "defect: entry printed" "- [D1] $(date '+%Y-%m-%d') · Ribbon icon sits 2 px low · where: ribbon (app/src/ribbon.tsx) · from: T07 review · severity: low · slot: end of set · status: deferred" "$out"
check "defect: after the format comment" "-->

- [D1]" "$(cat "$P/.crew/defects.md")"
check "defect: journaled" "lead · Deferred D1 (low): Ribbon icon sits 2 px low, where: ribbon (app/src/ribbon.tsx)" "$(tail -n 1 "$P/.crew/journal.md")"
out=$("$CREW" defect "Text lost on reload" --where editor --severity high 2>&1); rc=$?
check "defect: high severity refused" "never deferred" "$out"
[ "$rc" -ne 0 ] && ok "defect: high severity exits non-zero" || ko "defect: high severity exits 0"
out=$("$CREW" defect "No where" 2>&1)
check "defect: --where required" "--where is required" "$out"
"$CREW" defect "Offline save shows a raw error code" --where "save state (app/src/save-state.tsx)" --severity medium --from "T08 review" >/dev/null
check "dashboard: deferred defects counted" "**Deferred defects:** 2 (medium 1)" "$(cat "$P/.crew/status.md")"
out=$("$CREW" defect D1 --status fixed --promote 2>&1)
check "defect: --promote only with scheduled" "goes with --status scheduled" "$out"
out=$("$CREW" defect D1 --promote --note "it broke T09's ribbon screenshot check")
check "defect: promoted" "status: scheduled · promoted" "$out"
check "defect: promotion journaled" "Promoted D1 (Ribbon icon sits 2 px low): it broke T09's ribbon screenshot check" "$(tail -n 1 "$P/.crew/journal.md")"
"$CREW" defect D2 --status fixed --note "in T10" >/dev/null
check "defect: fixed journaled" "Fixed D2 (Offline save shows a raw error code): in T10" "$(tail -n 1 "$P/.crew/journal.md")"
st=$(cat "$P/.crew/status.md")
check "dashboard: defects summary" "Deferred 0 · scheduled 1 · fixed 1 · dropped 0 · promoted 1 of 2 (deferrals that bit other work)" "$st"
check "dashboard: open defects table" "| D1 | Ribbon icon sits 2 px low | ribbon (app/src/ribbon.tsx) | T07 review | low | end of set | scheduled (promoted) |" "$st"
check_not "dashboard: fixed defects not listed" "| D2 |" "$st"

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
"$CREW" status >/dev/null
st=$(cat "$P/.crew/status.md")
check "timing: section" "## Timing" "$st"
check "timing: clock line" "on the clock · slept 6 min · agents at work 44 min · lead and waiting 1 h 9 min" "$st"
check "timing: phase split" "Task time 43 min: build 26 min (61%) · review 12 min (27%) · rework 5 min (11%) · CHANGES verdicts 1" "$st"
check "timing: critical path and headroom" "Critical path so far: T06 → T07 · 40 min · parallel headroom 3 min" "$st"
check "timing: a sleep pauses every run it falls in" "| T09 | 3 min | — | — | — | 3 min | 6 min |" "$st"
check "timing: T06 row" "| T06 | 10 min | 7 min | 5 min | 1 | 22 min | — |" "$st"
check "timing: T07 row, sleep left out" "| T07 | 13 min | 5 min | — | — | 18 min | 6 min |" "$st"
check "timing: set-level row" "| Set level (qa) | — | — | — | — | 4 min | — |" "$st"
# A finished set: every task accepted and nothing running stops the clock at the last run's end.
cp "$P/.crew/tasks/autosave/index.md" "$T/index.keep"
sed -i.bak -E 's/^\| (T[0-9]+) \| [a-z ]+ \|/| \1 | accepted |/' "$P/.crew/tasks/autosave/index.md"
"$CREW" status >/dev/null
check "timing: a finished set stops the clock" "to the last agent run ($(date -r $((b + 3240)) '+%H:%M' 2>/dev/null || date -d "@$((b + 3240))" '+%H:%M')): 57 min on the clock · slept 6 min · agents at work 44 min · lead and waiting 6 min" "$(cat "$P/.crew/status.md")"
cp "$T/index.keep" "$P/.crew/tasks/autosave/index.md"

# ---- 11. keep awake, stop ----
check "keep awake: on after session start" "**Keep awake:** on (" "$(cat "$P/.crew/status.md")"
read -r kpid _ < "$S/keep-awake"
"$CREW" session stop >/dev/null
sleep 0.2
kill -0 "$kpid" 2>/dev/null && ko "keep awake: stopped with the crew" "pid $kpid still running" || ok "keep awake: stopped with the crew"
check "keep awake: off when stopped" "**Keep awake:** off (the crew is stopped)" "$(cat "$P/.crew/status.md")"
check "session stop: dashboard state" "⏹ stopped by you since" "$(cat "$P/.crew/status.md")"
hook lead-idle "{$J_BASE}" >/dev/null
check "session stop: survives the lead's Stop event" "⏹ stopped by you since" "$(cat "$P/.crew/status.md")"
hook lead-busy "{$J_BASE,\"prompt\":\"unrelated question\"}" >/dev/null
check "session stop: survives an unrelated founder prompt" "⏹ stopped by you since" "$(cat "$P/.crew/status.md")"
"$CREW" session start "$SID" >/dev/null
check "session stop: cleared by session start (/crew resume)" "⏸ waiting for you" "$(cat "$P/.crew/status.md")"

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
