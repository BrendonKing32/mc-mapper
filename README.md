# MC Mapper

Minecraft seed mapper for Cloudflare Pages. Enter a seed, get a pannable/zoomable Overworld biome map with structure markers, biome and structure filters, and saved seeds (Cloudflare D1).

- **Generation** runs in the browser: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT, vendored in `vendor/cubiomes`) compiled to WASM (`public/wasm/cubiomes.wasm`, committed) and run in two Web Workers (tiles / structures).
- **Saved seeds**: Pages Functions (`functions/api/seeds*`) backed by D1. Falls back to `localStorage` if the API is unavailable (plain `vite dev`).
- **Seed input**: numbers (64-bit signed) or text (hashed with Java `String.hashCode`, like the game).

## Develop
```
npm install
npm run db:local        # apply D1 migration to the local db
npm run build
npm run preview         # wrangler pages dev: UI + API + local D1 on :8788
npm test
```
`npm run dev` serves only the UI (saved seeds use localStorage).

## Deploy
```
npx wrangler d1 create mc-mapper          # put the database_id in wrangler.toml
npm run db:remote
npm run deploy
```
Confirm the `DB` D1 binding on the Pages project. There is no auth: anyone with the URL can edit saved seeds; put Cloudflare Access in front if needed.

## Rebuild the WASM
`npm run wasm` (downloads wasi-sdk into `.cache/`; no Emscripten needed). Wrapper: `wasm/wrapper.c`.

## Bedrock caveat
cubiomes only implements **Java** generation. The Bedrock option reuses the nearest Java generator and truncates seeds to 32 bits, so Bedrock biomes and especially structure positions are **approximate** (flagged in the UI). Exact Bedrock support needs Bedrock-specific structure salts/spacing and verification against real worlds.
