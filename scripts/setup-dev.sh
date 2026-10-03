#!/usr/bin/env bash
# Make the installed packages match the branch you are on.
#
#   npm run setup
#
# Why this exists: `git checkout` rewrites package.json and
# package-lock.json, but it does NOT touch node_modules (the folder
# where the actual installed packages live, and which git ignores).
# So after switching branches, node_modules can be out of date and
# `npm run dev` fails with confusing errors.
#
# This script compares what the branch *asks for* with what is
# *installed*, and only touches the network when they differ.
# If they already match, it prints "up to date" in under a second.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Find a Node 22 runtime, in order of preference -------------------
# 1. The version this repo pins in .nvmrc, if already on PATH.
# 2. A Homebrew node@22 install (brew install node@22).
# 3. Whatever node is on PATH (warn loudly if it is not 22).

WANT_MAJOR=22
NODE_BIN="$(command -v node || true)"

if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
  NODE_BIN=/opt/homebrew/opt/node@22/bin/node
elif [ -x /usr/local/opt/node@22/bin/node ]; then
  NODE_BIN=/usr/local/opt/node@22/bin/node
fi

if [ -z "$NODE_BIN" ]; then
  echo "No Node.js found. Install Node 22 first:" >&2
  echo "  brew install node@22" >&2
  exit 1
fi

NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$WANT_MAJOR" ]; then
  echo "Node $("$NODE_BIN" --version) is too old. This app needs Node 22 or newer." >&2
  echo "Install Node 22:  brew install node@22   (see .nvmrc)" >&2
  exit 1
fi
if [ "$NODE_MAJOR" -gt "$WANT_MAJOR" ]; then
  echo "⚠ Using Node $("$NODE_BIN" --version), but this repo pins Node $(cat .nvmrc 2>/dev/null || echo 22)." >&2
  echo "  Newer npm can rewrite package-lock.json in ways CI (Node 22) will not accept." >&2
  echo "  Fix: brew install node@22 — this script will then use it automatically." >&2
fi

# Put the chosen node/npm first for every command below.
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "Using node $("$NODE_BIN" --version) at $NODE_BIN"

# --- Sync frontend and backend dependencies ----------------------------
# Stamp file: remembers the exact dependency state we last installed.
# It lives inside node_modules so git never sees it and branch
# switches never fight over it.
STAMP_NAME=.valley-deps-stamp

for area in frontend backend; do
  echo "==> $area"
  pkg="$area/package.json"
  lock="$area/package-lock.json"
  mods="$area/node_modules"
  stamp="$mods/$STAMP_NAME"

  # A single fingerprint of everything npm would install from.
  # Must match the hashing in scripts/require-node22.js (sha256 of
  # package.json followed by package-lock.json, no separator).
  want="$(cat "$pkg" "$lock" | shasum -a 256 | cut -d' ' -f1)"

  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ]; then
    echo "up to date"
    continue
  fi

  # Lockfile and package.json agree -> exact, fast, reproducible install.
  # They disagree (e.g. you just added a dependency) -> npm install,
  # which updates the lockfile too.
  if npm ls --prefix "$area" --package-lock-only >/dev/null 2>&1; then
    npm ci --prefix "$area"
  else
    npm install --prefix "$area"
  fi

  mkdir -p "$mods"
  printf '%s\n' "$want" > "$stamp"
done

echo
echo "All set. In two terminals run:"
echo "  npm run dev:backend"
echo "  npm run dev:frontend"
