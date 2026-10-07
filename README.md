# MC Mapper

Minecraft seed mapper for Cloudflare Pages. Enter a seed, get a pannable/zoomable Overworld biome map with structure markers, biome and structure filters, and saved seeds stored in your browser.

- **Generation** runs in the browser: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT, vendored in `vendor/cubiomes`) compiled to WASM (`public/wasm/cubiomes.wasm`, committed) and run in two Web Workers (tiles / structures).
- **Saved seeds** live in the browser's `localStorage` (`src/storage.ts`). There is no server, so nobody else can see or change them, but they don't sync between browsers or devices. Use **Export** to download them as JSON and **Import** to load that file elsewhere. If the browser refuses to save (storage full, disabled, private mode), the sidebar shows the reason.
- **Seed input**: numbers (64-bit signed) or text (hashed with Java `String.hashCode`, like the game).

## Develop
```
npm install
npm run dev             # dev server
npm test
npm run build && npm run preview
```

## Deploy
```
npm run deploy          # build + wrangler pages deploy dist
```
It's a static site: no database or bindings to set up.

## Rebuild the WASM
`npm run wasm` (downloads wasi-sdk into `.cache/`; no Emscripten needed). Wrapper: `wasm/wrapper.c`.

## Bedrock caveat
cubiomes only implements **Java** generation. The Bedrock option reuses the nearest Java generator and truncates seeds to 32 bits, so Bedrock biomes and especially structure positions are **approximate** (flagged in the UI). Exact Bedrock support needs Bedrock-specific structure salts/spacing and verification against real worlds.
