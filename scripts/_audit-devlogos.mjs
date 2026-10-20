// 临时探针：审计 developers.image_url 全量（可达性 + svg 是否带 DTD 实体）（验完删）
import postgres from 'postgres';

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 });
const base = process.env.R2_PUBLIC_BASE.replace(/\/+$/, '');
const rows = await sql.unsafe('SELECT slug, image_url FROM developers WHERE image_url IS NOT NULL ORDER BY slug');

const bad = [];
const entitySvg = [];
let ok = 0;
let idx = 0;

async function worker() {
  for (;;) {
    const i = idx++;
    if (i >= rows.length) return;
    const row = rows[i];
    const url = /^https?:/i.test(row.image_url) ? row.image_url : base + row.image_url;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (res.status !== 200) {
        bad.push({ slug: row.slug, image: row.image_url, reason: 'HTTP ' + res.status });
        await res.body?.cancel?.();
        continue;
      }
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('svg')) {
        const txt = await res.text();
        if (txt.includes('<!ENTITY') || /xmlns="&/.test(txt)) entitySvg.push(row.slug);
      } else {
        await res.arrayBuffer();
      }
      ok += 1;
    } catch (error) {
      bad.push({ slug: row.slug, image: row.image_url, reason: error.message.slice(0, 40) });
    }
  }
}
await Promise.all(Array.from({ length: 8 }, () => worker()));

console.log('总行', rows.length, '可访问', ok, '不可访问', bad.length, '实体型 svg', entitySvg.length);
console.log('--- 不可访问（前 10）---');
for (const b of bad.slice(0, 10)) console.log(b.slug, '|', b.image, '|', b.reason);
console.log('--- 实体型 svg ---');
console.log(entitySvg.join(', '));
await sql.end();
