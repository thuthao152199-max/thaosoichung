const KINDS = ['tim', 'haha'];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const read = async (store, id) => (await store.get(id, { type: 'json' })) || { r: { tim: 0, haha: 0 }, u: [] };
export async function handle(req, store, adminKey) {
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id');
    if (!validId(id)) return json({ error: 'Mã bài không hợp lệ' }, 400);
    return json(await read(store, id));
  }
  if (req.method !== 'POST') return json({ error: 'Không hỗ trợ' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Dữ liệu lỗi' }, 400); }
  if (!validId(b.id)) return json({ error: 'Mã bài không hợp lệ' }, 400);
  const d = await read(store, b.id);
  if (b.a === 'react') {
    if (!KINDS.includes(b.k) || ![1, -1].includes(b.v)) return json({ error: 'Dữ liệu lỗi' }, 400);
    d.r[b.k] = Math.max(0, (d.r[b.k] || 0) + b.v);
  } else if (b.a === 'post' || b.a === 'del') {
    if (!adminKey || b.key !== adminKey) return json({ error: 'Sai mã quản trị' }, 403);
    if (b.a === 'post') {
      const text = String(b.text || '').trim().slice(0, 3000);
      if (!text) return json({ error: 'Chưa có nội dung' }, 400);
      const d0 = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Saigon', dateStyle: 'short', timeStyle: 'short' });
      d.u.unshift({ id: Date.now().toString(36), d: d0, t: text });
    } else {
      d.u = d.u.filter((x) => x.id !== b.uid);
    }
  } else return json({ error: 'Không hỗ trợ' }, 400);
  await store.setJSON(b.id, d);
  return json(d);
}
