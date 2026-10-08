# Deployment

MC Mapper is a static site served by **Cloudflare Workers static assets**. There is no Worker script, database, KV, secret or binding to configure.

## `wrangler.toml`

```toml
name = "mc-mapper"
compatibility_date = "2025-01-01"

[build]
command = "npm run build"   # used by local `wrangler deploy` only

[assets]
directory = "./dist"

[previews]                   # needed by `wrangler preview` (empty is fine)
```

## Deploy from your machine

```sh
npx wrangler login   # once
npm run deploy       # wrangler deploy: runs the [build] command, then uploads dist/
```

## Deploy from Git (Cloudflare Workers Builds)

With Workers Builds connected to the GitHub repo, set in the Cloudflare dashboard:

| Setting | Value |
|---|---|
| Build command | `npm run build` (**required**: Workers Builds ignores `[build]` in `wrangler.toml`, and without it `dist/` doesn't exist) |
| Production branch | `main` |
| Deploy command | default: `npx wrangler deploy` |
| Non-production branch deploy command | default: `npx wrangler preview` (needs the `[previews]` block) |

Every push to `main` deploys to production; pushes to other branches get a preview URL.

## Things to remember

- `public/wasm/cubiomes.wasm` is committed and copied into `dist/` by Vite, so the build needs no C toolchain. Rebuild and commit it if you change the generator.
- Saved seeds are in users' browsers, so deploys never touch user data. Changing the domain, though, gives users an empty list (different origin); they'd need to Export/Import.
