#!/usr/bin/env bash
# crew-worktree-teardown v1
#
# The project's cleanup for a checkout about to be removed: stop what runs from it,
# drop what was created for it.
#
# Usage: .crew/worktree/teardown.sh <path>
#   <path>  the worktree about to be removed
#
# Run by `.crew/bin/crew worktree teardown <path>` from the main checkout, after the task
# data is harvested and before the worktree and its branch are removed. Never run git
# here: crew removes the worktree and deletes its branch itself.
#
# The skill's `/crew setup` maintains this header. The marked section below belongs to
# the project.

set -eu

if [ $# -lt 1 ] || [ -z "$1" ]; then
  printf 'usage: teardown.sh <worktree-path>\n' >&2
  exit 1
fi
target=$1
if [ ! -d "$target" ]; then
  printf 'teardown: %s does not exist; nothing to clean up\n' "$target"
  exit 0
fi
cd "$target"

# step COMMAND...: print the step, then run it.
step() {
  printf 'teardown: %s\n' "$*"
  "$@"
}

# --- project teardown (edit freely) ---
# A no-op by default. Examples:
#
# Stop a dev server bound to this checkout (if it wrote its pid there):
#   if [ -f .crew/tmp/dev-server.pid ]; then
#     step kill "$(cat .crew/tmp/dev-server.pid)" || true
#   fi
#
# Drop a scratch database named after the branch (recorded by crew worktree setup):
#   branch=$(sed -n 's/.*"branch": *"\([^"]*\)".*/\1/p' .crew/tmp/worktree.json)
#   step dropdb --if-exists "app_$(printf '%s' "$branch" | tr -c 'A-Za-z0-9' '_')"
# --- end ---

printf 'teardown: done for %s\n' "$(pwd)"
