const KINDS = ['tim', 'haha'];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const read = async (store, id) => {
  const d = (await store.get(id, { type: 'json' })) || {};
  return { r: d.r || { tim: 0, haha: 0 }, u: d.u || [], c: d.c || [] };
};
const now = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Saigon', dateStyle: 'short', timeStyle: 'short' });
const today = (off = 0) => new Date(Date.now() + 7 * 3600e3 - off * 864e5).toISOString().slice(0, 10);
const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
// Bản công khai: bỏ số điện thoại, bỏ bình luận chưa duyệt
const pub = (d, admin) => ({ r: d.r, u: d.u, c: admin ? d.c : d.c.filter((x) => x.ok).map(({ ph, ...x }) => x) });

export async function handle(req, store, adminKey, opts = {}) {
  const url = new URL(req.url);
  const isAdmin = (k) => !!adminKey && k === adminKey;
  if (req.method === 'GET') {
    if (url.searchParams.get('stats') === '1') {
      if (!isAdmin(url.searchParams.get('key'))) return json({ error: 'Sai mã quản trị' }, 403);
      return json(await stats(store, Math.min(90, Number(url.searchParams.get('days')) || 30)));
    }
    const id = url.searchParams.get('id');
    if (!validId(id)) return json({ error: 'Mã bài không hợp lệ' }, 400);
    return json(pub(await read(store, id), isAdmin(url.searchParams.get('key'))));
  }
  if (req.method !== 'POST') return json({ error: 'Không hỗ trợ' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Dữ liệu lỗi' }, 400); }
  if (b.a === 'view') return view(store, b);
  if (!validId(b.id)) return json({ error: 'Mã bài không hợp lệ' }, 400);
  const d = await read(store, b.id);
  const admin = isAdmin(b.key);
  if (b.a === 'react') {
    if (!KINDS.includes(b.k) || ![1, -1].includes(b.v)) return json({ error: 'Dữ liệu lỗi' }, 400);
    d.r[b.k] = Math.max(0, (d.r[b.k] || 0) + b.v);
  } else if (b.a === 'cmt') {
    if (b.web) return json(pub(d, false)); // bẫy chống spam: người thật không điền ô ẩn này
    const n = clean(b.n, 40), t = clean(b.t, 1000), ph = clean(b.ph, 40);
    if (!n || !t) return json({ error: 'Chị/anh nhập tên và nội dung giúp em' }, 400);
    const last = d.c[0];
    if (last && Date.now() - parseInt(last.id, 36) < 15000) return json({ error: 'Vui lòng đợi vài giây rồi gửi lại' }, 429);
    if (d.c.length >= 500) return json({ error: 'Bài này đã đủ bình luận' }, 400);
    d.c.unshift({ id: Date.now().toString(36), d: now(), n, t, ph, ok: !opts.moderate });
  } else if (['post', 'del', 'cdel', 'cok'].includes(b.a)) {
    if (!admin) return json({ error: 'Sai mã quản trị' }, 403);
    if (b.a === 'post') {
      const text = clean(b.text, 3000);
      if (!text) return json({ error: 'Chưa có nội dung' }, 400);
      d.u.unshift({ id: Date.now().toString(36), d: now(), t: text });
    } else if (b.a === 'del') d.u = d.u.filter((x) => x.id !== b.uid);
    else if (b.a === 'cdel') d.c = d.c.filter((x) => x.id !== b.uid);
    else d.c.forEach((x) => { if (x.id === b.uid) x.ok = true; });
  } else return json({ error: 'Không hỗ trợ' }, 400);
  await store.setJSON(b.id, d);
  return json(pub(d, admin));
}

// Lượt xem: mỗi lượt là một khóa riêng, thông tin nằm ngay trong tên khóa nên không bị ghi đè khi nhiều người cùng xem.
// Không lưu IP, không lưu tên: chỉ có mã trình duyệt ngẫu nhiên, loại thiết bị và nguồn vào trang.
const SRC = [['zalo', /zalo/], ['facebook', /facebook|fb\.|messenger/], ['google', /google/], ['tiktok', /tiktok/]];
async function view(store, b) {
  const p = String(b.p || '');
  if (!/^[a-z0-9-]{1,48}$/.test(p)) return json({ ok: false }, 400);
  const v = /^[a-z0-9]{6,16}$/.test(b.v || '') ? b.v.slice(0, 10) : 'x';
  const dev = b.m ? 'm' : 'd';
  const ref = String(b.r || '').toLowerCase();
  const src = !ref ? 'truc-tiep' : (SRC.find(([, re]) => re.test(ref)) || ['khac'])[0];
  await store.set(`v/${today()}/${p}/${dev}/${src}/${v}/${Math.random().toString(36).slice(2, 8)}`, '');
  return json({ ok: true });
}
async function stats(store, days) {
  const out = { days, pages: {}, day: {}, src: {}, dev: {}, readers: 0, views: 0 };
  const all = new Set();
  const keys = [];
  for (let i = 0; i < days; i++) {
    const day = today(days - 1 - i);
    const { blobs } = await store.list({ prefix: `v/${day}/` });
    blobs.forEach((x) => keys.push(x.key));
  }
  const per = {};
  for (const k of keys) {
    const [, day, p, dev, src, v] = k.split('/');
    out.views++; all.add(v);
    const o = (out.pages[p] ||= { views: 0, readers: 0, today: 0 });
    o.views++; if (day === today()) o.today++;
    (per[p] ||= new Set()).add(v);
    const dd = (out.day[day] ||= { views: 0, readers: new Set() });
    dd.views++; dd.readers.add(v);
    out.src[src] = (out.src[src] || 0) + 1;
    out.dev[dev] = (out.dev[dev] || 0) + 1;
  }
  for (const p in per) out.pages[p].readers = per[p].size;
  for (const d in out.day) out.day[d] = { views: out.day[d].views, readers: out.day[d].readers.size };
  out.readers = all.size;
  // Bình luận mới nhất trên toàn site (kèm số điện thoại cho chị)
  const { blobs } = await store.list({ directories: true });
  const cm = [];
  for (const x of blobs) {
    if (x.key.startsWith('v/') || !validId(x.key)) continue;
    const d = await read(store, x.key);
    d.c.forEach((c) => cm.push({ ...c, bai: x.key }));
  }
  out.comments = cm.sort((a, b) => parseInt(b.id, 36) - parseInt(a.id, 36)).slice(0, 50);
  return out;
}
