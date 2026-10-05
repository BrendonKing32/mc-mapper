#!/usr/bin/env bash
# Builds public/wasm/cubiomes.wasm using wasi-sdk (set WASI_SDK_PATH, or it is downloaded to .cache/).
set -euo pipefail
cd "$(dirname "$0")/.."
SDK="${WASI_SDK_PATH:-.cache/wasi-sdk-25.0-x86_64-linux}"
if [ ! -x "$SDK/bin/clang" ]; then
  mkdir -p .cache
  curl -sL https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-x86_64-linux.tar.gz | tar xz -C .cache
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
