# MC Mapper

MC Mapper is a Minecraft seed map that runs entirely in the browser. Enter a seed and you get a pannable, zoomable biome map of the Overworld, Nether or End, with structure markers, biome and structure filters, a Nether portal calculator, and saved seeds (with notes, visited structures and pins) kept in your browser.

It supports **Java Edition 1.7 → 1.21 (Winter Drop)** and **Bedrock Edition 1.18 → 1.21+**.

## How it works, in one paragraph

World generation is done by [cubiomes](https://github.com/Cubitect/cubiomes) (a C library that reimplements Minecraft's biome and structure generation), vendored in `vendor/cubiomes` and compiled to WebAssembly together with a small wrapper (`wasm/wrapper.c`) that adds Bedrock structure placement. The browser runs that WASM in two Web Workers (one for biome tiles, one for structure searches) and draws the results onto a `<canvas>`. There is no backend: the site is static files served by Cloudflare Workers static assets, and saved seeds live in `localStorage`.

## Pages

**Using the app**
- [[User Guide]]: every feature, how to use it, and keyboard/touch controls
- [[Accuracy and Limitations]]: what's exact, what's approximate, and why

**Working on the code**
- [[Architecture]]: modules, data flow, workers, rendering and caching
- [[WASM Generator]]: the C wrapper's API, biome sampling, and rebuilding the `.wasm`
- [[Bedrock Support]]: how Bedrock seeds, biomes and structures are handled
- [[Data and Storage]]: saved-seed format, limits, Export/Import, URL parameters and `localStorage` keys
- [[Development]]: setup, scripts, tests, and recipes for common changes
- [[Deployment]]: Cloudflare Workers setup and preview deploys

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript (strict), plain DOM, no UI framework |
| Build / dev server | Vite 6 |
| Tests | Vitest 5 |
| Generation | cubiomes (MIT) → WASM via wasi-sdk 25 |
| Hosting | Cloudflare Workers static assets (`wrangler`) |
| Persistence | Browser `localStorage` only |

## Quick start

```sh
npm install
npm run dev      # http://localhost:5173
npm test
```
