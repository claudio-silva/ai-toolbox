#!/usr/bin/env bash
# Probe: can a process outside Claude Code (the dashboard server) message a running session through
# its inbox socket (cross-session messaging), and how does the session see the message?
#
#   tests/probe-inbox.sh [--bypass]     (needs claude, jq and node; costs about 2 cents)
#
# A hook records the session's CLAUDE_CODE_MESSAGING_SOCKET and _TOKEN, the way bin/crew does.
# The session runs in stream-json mode (the way the Agent SDK, and so Paseo, runs Claude Code) and
# goes idle; this script then posts to its socket from outside, with the token (as a child of the
# session would) and without it, and reports whether each message started a turn and what the
# model saw. --bypass runs the session with --permission-mode bypassPermissions, as Paseo does:
# there, a message that does not say its sender's permission class is held, not delivered. The
# third message ("envelope") is the dashboard's: the token, and Claude Code's own envelope
# <cross-session-message from-mode="bypass|prompting"> naming the session's own class.

set -uo pipefail
command -v claude >/dev/null && command -v jq >/dev/null && command -v node >/dev/null || { echo "needs claude, jq and node" >&2; exit 2; }
MODE=(); [[ "${1:-}" == --bypass ]] && MODE=(--permission-mode bypassPermissions)
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
P="$WORK/project"; mkdir -p "$P/.claude"; git -C "$P" init -q
cat >"$P/.claude/settings.json" <<'JSON'
{ "hooks": { "UserPromptSubmit": [ { "hooks": [ { "type": "command",
  "command": "printf '%s\\n%s\\n' \"$CLAUDE_CODE_MESSAGING_SOCKET\" \"$CLAUDE_CODE_MESSAGING_TOKEN\" > \"$CLAUDE_PROJECT_DIR/inbox.txt\"" } ] } ] } }
JSON

post() { # socket token(or "") text
  node -e '
    const net = require("net"); const [sock, token, text] = process.argv.slice(1);
    const c = net.createConnection(sock, () => {
      if (token) c.write(JSON.stringify({ type: "auth", token }) + "\n");
      c.end(JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n");
    });
    c.on("data", (d) => process.stdout.write("socket said: " + d));
    c.on("error", (e) => { console.log("socket error: " + e.message); process.exit(1); });
    c.on("close", () => process.exit(0));' "$1" "$2" "$3"
}
results() { local n; n=$(grep -c "\"type\":\"result\"" "$OUT" 2>/dev/null); echo "${n:-0}"; }
wait_results() { # n seconds
  for _ in $(seq 1 $(( $2 * 2 ))); do [[ "$(results)" -ge $1 ]] && return 0; sleep 0.5; done; return 1
}

OUT="$WORK/out.jsonl"; FIFO="$WORK/in.fifo"; mkfifo "$FIFO"
(cd "$P" && claude -p --input-format stream-json --output-format stream-json --verbose \
   --model haiku --effort low --tools "" ${MODE[@]+"${MODE[@]}"} <"$FIFO" >"$OUT" 2>"$WORK/err") &
PID=$!; exec 7>"$FIFO"
jq -cn '{type:"user",message:{role:"user",content:"Reply with OK. Later messages may arrive; for each, reply with one line: SENDER=<who you think sent it> TEXT=<its text>."}}' >&7
wait_results 1 90 || { echo "first turn never ended"; cat "$WORK/err"; exit 1; }
SOCK="$(sed -n 1p "$P/inbox.txt")"; TOKEN="$(sed -n 2p "$P/inbox.txt")"
echo "mode: ${MODE[*]+${MODE[*]}}"
echo "socket: ${SOCK:-(none exported to hooks)}  token: ${TOKEN:+exported}"
[[ -S "$SOCK" ]] || { echo "no socket: cross-session messaging is off here"; exit 1; }

CLASS=prompting; [[ -n "${MODE[*]+x}" ]] && CLASS=bypass
for variant in token none envelope; do
  before="$(results)"
  case $variant in
    token) post "$SOCK" "$TOKEN" "probe with token" ;;
    none) post "$SOCK" "" "probe without token" ;;
    envelope) post "$SOCK" "$TOKEN" "<cross-session-message from-mode=\"$CLASS\">
probe with envelope
</cross-session-message>" ;;
  esac
  if wait_results $((before + 1)) 45; then
    printf '%-6s → started a turn: %s\n' "$variant" "$(jq -r 'select(.type=="result") | .result' "$OUT" | tail -1 | tr '\n' ' ' | cut -c1-200)"
  else
    printf '%-6s → no turn within 45 s (held or refused)\n' "$variant"
  fi
done

# How the message reached the model, from the stream.
echo "--- what the stream shows for the injected messages:"
grep -F 'probe with' "$OUT" | grep -v '"type":"result"' | cut -c1-700
echo "--- messages the session held:"
jq -c 'select(.subtype=="peer_message_hold")' "$OUT" | cut -c1-300
# And how it is written to the session's transcript (what a transcript reader such as the dashboard sees).
SID="$(jq -r 'select(.subtype=="init") | .session_id' "$OUT" | head -1)"
TR="$(find ~/.claude/projects -name "$SID.jsonl" 2>/dev/null | head -1)"
echo "--- the transcript's records for them (${TR:-no transcript found}):"
[[ -n "$TR" ]] && grep -F 'probe with' "$TR" | jq -c 'del(.message.usage, .requestId, .uuid, .parentUuid, .cwd, .version, .gitBranch, .sessionId)' | cut -c1-900
exec 7>&-; sleep 2; pkill -P $PID 2>/dev/null; kill $PID 2>/dev/null; wait $PID 2>/dev/null
[[ -n "${PROBE_KEEP:-}" ]] && cp "$OUT" "$PROBE_KEEP"
[[ -n "$TR" ]] && rm -f "$TR" && rmdir "$(dirname "$TR")" 2>/dev/null
true
