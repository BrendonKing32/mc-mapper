# MC Mapper

Minecraft seed mapper for Cloudflare Workers (static assets). Enter a seed, get a pannable/zoomable Overworld biome map with structure markers, biome and structure filters, and saved seeds stored in your browser.

- **Generation** runs in the browser: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT, vendored in `vendor/cubiomes`) compiled to WASM (`public/wasm/cubiomes.wasm`, committed) and run in two Web Workers (tiles / structures).
- **Saved seeds** live in the browser's `localStorage` (`src/storage.ts`). There is no server, so nobody else can see or change them, but they don't sync between browsers or devices. Use **Export** to download them as JSON and **Import** to load that file elsewhere. If the browser refuses to save (storage full, disabled, private mode), the sidebar shows the reason.
- **Notes and visited structures** belong to a saved seed: once the seed on the map is saved, the sidebar's **Notes** box saves as you type, and clicking a structure lets you **Mark visited** (shown with a green check; **Hide visited** removes them from the map). They are included in Export/Import.
- **Nether portal calculator**: type Overworld or Nether X/Z in the sidebar to get the matching spot in the other dimension (X/Z ÷ 8, rounded down like the game; Y unchanged). **Use map center** fills it from the map, and **Show Overworld / Show Nether** jump the map there. Clicking a structure also offers **Nether portal coords** (or **Overworld portal coords** for Nether structures).
- **What's new**: the sidebar's **What's new** button lists recent changes from `src/data/changelog.ts`, with a dot when there's something you haven't seen (remembered in `localStorage`). First-time visitors start caught up. When shipping something users will notice, add an entry at the top of that file with a new, unique `id`.
- **Seed input**: numbers (64-bit signed, both editions) or text (hashed with Java `String.hashCode`, like the game).

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

## Bedrock
cubiomes only implements **Java** generation; `wasm/wrapper.c` adds Bedrock on top of it:
- **Overworld biomes** use the matching Java generator with the full 64-bit seed: since 1.18 the two editions generate the same biomes for the same seed.
- **Structures** use Bedrock's own placement: a Mersenne Twister seeded per region from the low 32 bits of the seed, with Bedrock's salts and spacing, and a biome check at the structure's own chunk. Constants follow the open-source Bedrock finders [SeedFinder](https://github.com/zebedelu/SeedFinder) and [MCBE-seedcracker](https://github.com/Alist2930/MCBE-seedcracker), which agree on them. `tests/bedrock.test.ts` checks villages against positions confirmed in a real Bedrock world. Trail ruins and trial chambers use Java's placement, as Bedrock does.
- **Still approximate**: spawn, strongholds, desert wells and End gateways/islands (no Bedrock data, so they show Java's positions; marked ≈ in the filters), Nether and End biomes (generated from the low 32 bits of the seed, which is what Bedrock uses, but the editions' generators differ there), and which Nether regions get a fortress or a bastion (Bedrock's 1-in-3 / 2-in-3 split, but the draw that decides it is inferred).
