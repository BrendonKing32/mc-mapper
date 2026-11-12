#!/usr/bin/env bash
# Builds public/wasm/cubiomes.wasm using wasi-sdk (set WASI_SDK_PATH, or it is downloaded to .cache/).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${WASI_SDK_PATH:-}" ]; then
  SDK="$WASI_SDK_PATH"
else
  case "$(uname -s)" in
    Darwin) OS=macos ;;
    Linux) OS=linux ;;
    *) echo "Unsupported host OS; set WASI_SDK_PATH to an installed wasi-sdk." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64) ARCH=x86_64 ;;
    *) echo "Unsupported host architecture; set WASI_SDK_PATH to an installed wasi-sdk." >&2; exit 1 ;;
  esac
  SDK=".cache/wasi-sdk-25.0-$ARCH-$OS"
  if [ ! -x "$SDK/bin/clang" ]; then
    mkdir -p .cache
    curl --fail --silent --show-error --location \
      "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-$ARCH-$OS.tar.gz" | tar xz -C .cache
  fi
fi
if [ ! -x "$SDK/bin/clang" ]; then
  echo "wasi-sdk compiler not found at $SDK/bin/clang." >&2
  exit 1
fi
C=vendor/cubiomes
mkdir -p public/wasm
"$SDK/bin/clang" -O3 -DNDEBUG -I$C -mexec-model=reactor -nostartfiles \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=33554432 -Wl,--max-memory=1073741824 -Wl,--allow-undefined \
  -Wl,--export=mc_init -Wl,--export=mc_biomes -Wl,--export=mc_biome_at -Wl,--export=mc_structures \
  -Wl,--export=mc_spawn -Wl,--export=mc_strongholds -Wl,--export=mc_is_slime -Wl,--export=mc_malloc -Wl,--export=mc_free \
  wasm/wrapper.c $C/generator.c $C/biomes.c $C/layers.c $C/biomenoise.c $C/noise.c $C/finders.c $C/util.c \
  -o public/wasm/cubiomes.wasm
ls -l public/wasm/cubiomes.wasm
