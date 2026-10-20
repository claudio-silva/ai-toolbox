#!/usr/bin/env bash
# SKILL.md's body must fit the 5,000 tokens Claude Code re-attaches after a compaction.
# Estimate, conservatively: characters / 3.5 (Claude Code's own rough count is characters / 4).
set -u
cd "$(dirname "$0")/.." || exit 1
LIMIT=5000
chars=$(awk 'NR == 1 && /^---$/ { fm = 1; next } fm && /^---$/ { fm = 0; next } !fm' SKILL.md | LC_ALL=en_US.UTF-8 wc -m | tr -d ' ')
est=$(( (chars * 10 + 34) / 35 ))
if [ "$est" -le "$LIMIT" ]; then
  printf 'ok   SKILL.md body: %s characters, about %s tokens (limit %s)\n' "$chars" "$est" "$LIMIT"
else
  printf 'FAIL SKILL.md body: %s characters, about %s tokens, over the %s-token limit\n' "$chars" "$est" "$LIMIT"
  exit 1
fi
