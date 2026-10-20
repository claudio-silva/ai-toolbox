#!/usr/bin/env bash
# crew-worktree-setup v1
#
# The project's development setup for a fresh checkout: install dependencies, create
# local files, build what the dev server needs.
#
# Usage: .crew/worktree/setup.sh [<path>]
#   <path>  the checkout to prepare (default: the top level of the current git checkout)
#
# Run by `.crew/bin/crew worktree setup` as a builder's first step in a worktree; safe to
# run by hand or from a harness's own workspace setup. It must stay idempotent: on a
# checkout that is already prepared it is a cheap no-op, so running it twice is harmless.
#
# The skill's `/crew setup` maintains this header. The marked section below belongs to
# the project: setup fills it once and never touches it again.

set -eu

target=${1:-}
if [ -z "$target" ]; then
  target=$(git rev-parse --show-toplevel)
fi
cd "$target"

# step COMMAND...: print the step, then run it.
step() {
  printf 'setup: %s\n' "$*"
  "$@"
}

# --- project setup (edit freely) ---
# Empty by default: /crew setup fills this section from the repository (the install
# command, env-file copies, the build the dev server needs). Keep every line idempotent.
# Examples:
#   step pnpm install --frozen-lockfile
#   [ -f .env ] || step cp .env.example .env
#   [ -d dist ] || step pnpm build
# --- end ---

printf 'setup: done in %s\n' "$(pwd)"
