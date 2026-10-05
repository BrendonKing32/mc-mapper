interface Env { DB: D1Database }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare('SELECT * FROM seeds ORDER BY created_at DESC LIMIT 500').all();
  return json(results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.seed !== 'string' || !b.seed.trim() || typeof b.version !== 'string')
    return json({ error: 'seed and version required' }, 400);
  const row = {
    id: crypto.randomUUID(),
    name: String(b.name || b.seed).slice(0, 100),
    seed: b.seed.trim().slice(0, 100),
    edition: b.edition === 'bedrock' ? 'bedrock' : 'java',
    version: b.version.slice(0, 40),
    notes: String(b.notes ?? '').slice(0, 1000),
    created_at: Date.now(),
  };
  await env.DB.prepare(
    'INSERT INTO seeds (id,name,seed,edition,version,notes,created_at) VALUES (?,?,?,?,?,?,?)',
  ).bind(row.id, row.name, row.seed, row.edition, row.version, row.notes, row.created_at).run();
  return json(row, 201);
};
