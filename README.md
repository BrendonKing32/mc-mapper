# MC Mapper

Minecraft seed mapper for Cloudflare Workers (static assets). Enter a seed, get a pannable/zoomable Overworld biome map with structure markers, biome and structure filters, and saved seeds stored in your browser.

- **Generation** runs in the browser: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT, vendored in `vendor/cubiomes`) compiled to WASM (`public/wasm/cubiomes.wasm`, committed) and run in two Web Workers (tiles / structures).
- **Saved seeds** live in the browser's `localStorage` (`src/storage.ts`). There is no server, so nobody else can see or change them, but they don't sync between browsers or devices. Use **Export** to download them as JSON and **Import** to load that file elsewhere. If the browser refuses to save (storage full, disabled, private mode), the sidebar shows the reason.
- **Notes and visited structures** belong to a saved seed: once the seed on the map is saved, the sidebar's **Notes** box saves as you type, and clicking a structure lets you **Mark visited** (shown with a green check; **Hide visited** removes them from the map). They are included in Export/Import.
- **Nether portal calculator**: type Overworld or Nether X/Z in the sidebar to get the matching spot in the other dimension (X/Z ÷ 8, rounded down like the game; Y unchanged). **Use map center** fills it from the map, and **Show Overworld / Show Nether** jump the map there. Clicking a structure also offers **Nether portal coords** (or **Overworld portal coords** for Nether structures).
- **What's new**: the sidebar's **What's new** button lists recent changes from `src/data/changelog.ts`, with a dot when there's something you haven't seen (remembered in `localStorage`). First-time visitors start caught up. When shipping something users will notice, add an entry at the top of that file with a new, unique `id`.
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
npm run deploy          # wrangler deploy (builds first, then uploads dist/ as Worker static assets)
```
It's a static site served from Workers static assets (`wrangler.toml`): no Worker script, database or bindings to set up. With Cloudflare Workers Builds connected to the repo, set the **build command** to `npm run build` (Workers Builds ignores `[build]` in `wrangler.toml`, and without it `dist/` doesn't exist), set the **production branch** to `main`, and keep the default deploy commands (`npx wrangler deploy` for `main`, `npx wrangler preview` for other branches; the latter needs the `[previews]` block in `wrangler.toml`).

## Rebuild the WASM
`npm run wasm` (downloads wasi-sdk into `.cache/`; no Emscripten needed). Wrapper: `wasm/wrapper.c`.

## Bedrock caveat
cubiomes only implements **Java** generation. The Bedrock option reuses the nearest Java generator and truncates seeds to 32 bits, so Bedrock biomes and especially structure positions are **approximate** (flagged in the UI). Exact Bedrock support needs Bedrock-specific structure salts/spacing and verification against real worlds.
