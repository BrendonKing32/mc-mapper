interface Env { DB: D1Database }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const onRequestPut: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: 'invalid body' }, 400);
  const r = await env.DB.prepare('UPDATE seeds SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ?')
    .bind(typeof b.name === 'string' ? b.name.slice(0, 100) : null, typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null, params.id)
    .run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'not found' }, 404);
};

export const onRequestDelete: PagesFunction<Env, 'id'> = async ({ env, params }) => {
  await env.DB.prepare('DELETE FROM seeds WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
};
