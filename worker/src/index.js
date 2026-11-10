const enc = new TextEncoder();
const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const eq = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return d === 0; };
async function hash(p, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, k, 256));
}
const TOOLS = [
  { name: 'add_note', description: 'Apunta una nota o reunión en el tablón', inputSchema: { type: 'object', properties: { text: { type: 'string' }, type: { type: 'string', enum: ['note', 'meeting'] }, scope: { type: 'string', enum: ['work', 'personal'] }, urgency: { type: 'integer', minimum: 0, maximum: 10 }, date: { type: 'string', description: 'AAAA-MM-DD' }, time: { type: 'string', description: 'HH:MM' } }, required: ['text'] } },
  { name: 'list_pending', description: 'Lista las notas y reuniones pendientes', inputSchema: { type: 'object', properties: {} } },
  { name: 'add_event', description: 'Anota un evento en el calendario (cena, cumpleaños…)', inputSchema: { type: 'object', properties: { text: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-DD' }, time: { type: 'string', description: 'HH:MM' } }, required: ['text', 'date'] } },
  { name: 'set_shift', description: 'Pone el turno de un día: M mañana, T tarde, N noche, X saliente, L libre, none lo quita', inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'AAAA-MM-DD' }, shift: { type: 'string', enum: ['M', 'T', 'N', 'X', 'L', 'none'] } }, required: ['date', 'shift'] } },
  { name: 'list_calendar', description: 'Lista turnos y eventos del calendario entre dos fechas', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'complete_note', description: 'Marca una nota como hecha', inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
];

async function mcp(req, env, t) {
  const u = await env.KV.get('m:' + t);
  if (!u) return new Response('No encontrado', { status: 404 });
  if (req.method !== 'POST') return new Response('', { status: 405 });
  const m = await req.json().catch(() => null);
  if (!m || m.id === undefined) return new Response(null, { status: 202 });
  const R = r => J({ jsonrpc: '2.0', id: m.id, result: r });
  const E = (code, message) => J({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  if (m.method === 'initialize') return R({ protocolVersion: m.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'tablon', version: '1.0.0' } });
  if (m.method === 'ping') return R({});
  if (m.method === 'tools/list') return R({ tools: TOOLS });
  if (m.method !== 'tools/call') return E(-32601, 'No soportado');
  const a = m.params?.arguments || {}, items = (await env.KV.get('n:' + u, 'json')) || [];
  const put = () => env.KV.put('n:' + u, JSON.stringify(items));
  let out;
  if (m.params.name === 'add_note') {
    const it = { id: Date.now(), x: String(a.text || '').slice(0, 500), t: a.type === 'meeting' ? 'm' : 'n', c: a.scope === 'personal' ? 'p' : 'w', u: Math.min(10, Math.max(0, +a.urgency || 5)), d: a.date || '', h: a.time || '', done: false };
    if (it.t === 'm' && !it.d) it.d = new Date().toISOString().slice(0, 10);
    items.push(it); await put(); out = 'Apuntado: ' + it.x;
  } else if (m.params.name === 'list_pending') {
    out = JSON.stringify(items.filter(i => !i.done && (i.t === 'n' || i.t === 'm')).map(i => ({ id: i.id, text: i.x, type: i.t === 'm' ? 'meeting' : 'note', scope: i.c === 'p' ? 'personal' : 'work', urgency: i.u, date: i.d, time: i.h })));
  } else if (m.params.name === 'complete_note') {
    const it = items.find(i => i.id === +a.id);
    if (it) { it.done = true; it.dd = Date.now(); await put(); out = 'Hecha'; } else out = 'No existe esa nota';
  } else if (m.params.name === 'add_event') {
    const it = { id: Date.now(), t: 'e', x: String(a.text || '').slice(0, 200), d: String(a.date || ''), h: a.time || '', c: 'p', u: 0, done: false };
    items.push(it); await put(); out = 'Evento apuntado: ' + it.x;
  } else if (m.params.name === 'set_shift') {
    const d = String(a.date || ''), k = items.findIndex(i => i.t === 's' && i.d === d);
    if (k >= 0) items.splice(k, 1);
    if (['M', 'T', 'N', 'X', 'L'].includes(a.shift)) items.push({ id: Date.now(), t: 's', d, s: a.shift, x: '', c: 'p', u: 0, h: '', done: false });
    await put(); out = 'Turno de ' + d + ': ' + a.shift;
  } else if (m.params.name === 'list_calendar') {
    out = JSON.stringify(items.filter(i => (i.t === 's' || i.t === 'e') && i.d >= a.from && i.d <= a.to).map(i => i.t === 's' ? { date: i.d, shift: i.s } : { date: i.d, event: i.x, time: i.h }));
  } else return E(-32602, 'Herramienta desconocida');
  return R({ content: [{ type: 'text', text: out }] });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname, KV = env.KV;
    if (req.method === 'OPTIONS') return J({});
    try {
      if (p.startsWith('/mcp/')) return await mcp(req, env, p.slice(5));
      const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
      if (p === '/api/register' || p === '/api/login') {
        const u = String(body.user || '').toLowerCase().trim(), pw = String(body.pass || '');
        if (!/^[a-z0-9_.-]{3,32}$/.test(u)) return J({ error: 'Usuario de 3 a 32 letras, números o _ . -' }, 400);
        let rec = await KV.get('u:' + u, 'json');
        if (p === '/api/register') {
          if (!env.INVITE || body.invite !== env.INVITE) return J({ error: 'Código de invitación incorrecto' }, 403);
          if (rec) return J({ error: 'Ese usuario ya existe' }, 409);
          if (pw.length < 8) return J({ error: 'La contraseña necesita al menos 8 caracteres' }, 400);
          const salt = rnd(16); rec = { salt, hash: await hash(pw, salt), epoch: 1 };
          await KV.put('u:' + u, JSON.stringify(rec));
        } else if (!rec || !eq(await hash(pw, rec.salt), rec.hash)) return J({ error: 'Usuario o contraseña incorrectos' }, 401);
        const t = rnd(32);
        await KV.put('s:' + t, JSON.stringify({ u, e: rec.epoch }), { expirationTtl: 2592000 });
        return J({ token: t });
      }
      const tok = (req.headers.get('authorization') || '').slice(7);
      const s = tok && (await KV.get('s:' + tok, 'json'));
      const rec = s && (await KV.get('u:' + s.u, 'json'));
      if (!rec || rec.epoch !== s.e) return J({ error: 'Sesión caducada' }, 401);
      const u = s.u;
      if (p === '/api/items') {
        if (req.method === 'PUT') {
          if (!Array.isArray(body) || body.length > 2000 || JSON.stringify(body).length > 1e6) return J({ error: 'Datos no válidos' }, 400);
          await KV.put('n:' + u, JSON.stringify(body)); return J({ ok: true });
        }
        return J({ items: (await KV.get('n:' + u, 'json')) || [] });
      }
      if (p === '/api/password' && req.method === 'POST') {
        const pw = String(body.pass || '');
        if (pw.length < 8) return J({ error: 'La contraseña necesita al menos 8 caracteres' }, 400);
        const salt = rnd(16), next = { ...rec, salt, hash: await hash(pw, salt), epoch: rec.epoch + 1 };
        await KV.put('u:' + u, JSON.stringify(next));
        const t = rnd(32);
        await KV.put('s:' + t, JSON.stringify({ u, e: next.epoch }), { expirationTtl: 2592000 });
        return J({ token: t });
      }
      if (p === '/api/mcp') {
        let t = rec.mcp;
        if (req.method === 'POST' || !t) {
          if (t) await KV.delete('m:' + t);
          t = rnd(24); await KV.put('m:' + t, u);
          await KV.put('u:' + u, JSON.stringify({ ...rec, mcp: t }));
        }
        return J({ url: url.origin + '/mcp/' + t });
      }
      return J({ error: 'No encontrado' }, 404);
    } catch (e) { return J({ error: 'Error del servidor' }, 500); }
  },
};
