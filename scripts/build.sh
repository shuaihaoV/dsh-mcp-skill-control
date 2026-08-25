#!/bin/bash
# Build dsh-mcp-skill-control: link the globally installed dsh packages, compile
# src → lib/types with tsc, then bundle the browser half with tsdown.
# Dependencies resolve from the bun global dsh install (built lib/ artifacts).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GLOBAL_NM="${DSH_GLOBAL_NM:-$HOME/.bun/install/global/node_modules}"
if [ ! -d "$GLOBAL_NM/@deepseek-ai/cordis" ]; then
  echo "build: dsh global install not found at $GLOBAL_NM (set DSH_GLOBAL_NM)" >&2
  exit 1
fi
echo "=== dsh global install: $GLOBAL_NM ==="

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

NO_EMIT=""
if [ "${1:-}" = "--no-emit" ]; then NO_EMIT="--noEmit"; fi

echo "=== Compiling src → lib/types (tsc) ==="
bunx tsc -p tsconfig.json $NO_EMIT

if [ -z "$NO_EMIT" ]; then
  echo "=== Bundling client half (tsdown) ==="
  bunx tsdown
  echo "=== Build complete ==="
  ls -la lib/ lib/types/ 2>/dev/null
fi
