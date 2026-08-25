#!/bin/bash
# Build dsh-mcp-skill-control: compile src → lib/types with tsc, then bundle the
# browser half with tsdown.
#
# Two dependency-resolution modes:
#   1. Local development: symlink the runtime deps from a global dsh install
#      (bun global by default; override with DSH_GLOBAL_NM).
#   2. Git install (npm/pnpm `prepare`, e.g. `dsh plugin add git+<repo-url>`):
#      the package manager has installed the devDependencies, so build against
#      the local node_modules without any links.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Locate a global dsh install (for dev-link mode). Unset DSH_GLOBAL_NM probes
# the common global locations; a missing install falls back to local mode when
# node_modules/@deepseek-ai is already present.
GLOBAL_NM="${DSH_GLOBAL_NM:-}"
if [ -z "$GLOBAL_NM" ]; then
  for cand in \
    "$HOME/.bun/install/global/node_modules" \
    "$HOME/.local/share/pnpm/global/node_modules" \
    "$(npm root -g 2>/dev/null || true)" \
    "$(pnpm root -g 2>/dev/null || true)"; do
    if [ -n "$cand" ] && [ -d "$cand/@deepseek-ai/cordis" ]; then
      GLOBAL_NM="$cand"
      break
    fi
  done
fi

LINK_MODE=1
if [ -z "$GLOBAL_NM" ]; then
  if [ -d node_modules/@deepseek-ai/cordis ]; then
    LINK_MODE=0
    echo "=== no global dsh install found; building against local node_modules (prepare/git-install mode) ==="
  else
    echo "build: no global dsh install found (set DSH_GLOBAL_NM) and node_modules/@deepseek-ai is absent" >&2
    exit 1
  fi
else
  echo "=== dsh global install: $GLOBAL_NM ==="
fi

# 可选：如需经本地代理联网下载工具（bunx 首次拉取 tsdown/tsc 产物），
# 取消注释并改成你自己的代理地址。
# export http_proxy="${http_proxy:-http://127.0.0.1:7890}"
# export https_proxy="${https_proxy:-http://127.0.0.1:7890}"

link() {
  local link="node_modules/$1"
  local target="$2"
  if [ ! -e "$target" ]; then
    echo "build: dependency target missing: $target" >&2
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const path = require('path');
    fs.rmSync(path.resolve(process.argv[1]), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(path.resolve(process.argv[1])), { recursive: true });
    fs.symlinkSync(path.resolve(process.argv[2]), path.resolve(process.argv[1]), process.platform === 'win32' ? 'junction' : 'dir');
  " "$link" "$target"
}

if [ "$LINK_MODE" = 1 ]; then
  echo "=== Linking dependencies (global install) ==="
  mkdir -p node_modules/@types
  link @deepseek-ai "$GLOBAL_NM/@deepseek-ai"
  link react "$GLOBAL_NM/react"
  link react-dom "$GLOBAL_NM/react-dom"
  # yaml powers comment-preserving cordis.patch.yml edits (Document AST); it is
  # already a dsh dependency (settings-file, credentials-local), so the profile
  # resolves it at runtime without an extra install.
  link yaml "$GLOBAL_NM/yaml"
  [ -d "$GLOBAL_NM/@types/react" ] && link @types/react "$GLOBAL_NM/@types/react" || true
  [ -d "$GLOBAL_NM/@types/react-dom" ] && link @types/react-dom "$GLOBAL_NM/@types/react-dom" || true
fi

NO_EMIT=""
if [ "${1:-}" = "--no-emit" ]; then NO_EMIT="--noEmit"; fi

# Use the locally installed toolchain when present (prepare/git-install mode),
# else fall back to bunx (dev mode).
if [ -x node_modules/.bin/tsc ]; then TSC="node_modules/.bin/tsc"; else TSC="bunx tsc"; fi
if [ -x node_modules/.bin/tsdown ]; then TSDOWN="node_modules/.bin/tsdown"; else TSDOWN="bunx tsdown"; fi

echo "=== Compiling src → lib/types (tsc) ==="
"$TSC" -p tsconfig.json $NO_EMIT

if [ -z "$NO_EMIT" ]; then
  echo "=== Bundling client half (tsdown) ==="
  "$TSDOWN"
  echo "=== Build complete ==="
  ls -la lib/ lib/types/ 2>/dev/null
fi