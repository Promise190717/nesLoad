// 临时探针：看这批厂名在维基上都命中了什么（判断严格匹配是否过严）（验完删）
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const require = createRequire(import.meta.url);
const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
const undiciDir = readdirSync(pnpmDir).filter((n) => /^undici@\d+\.\d+\.\d+/.test(n)).sort().at(-1);
const { ProxyAgent } = require(join(pnpmDir, undiciDir, 'node_modules', 'undici'));
const dispatcher = new ProxyAgent('http://127.0.0.1:7897');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { dispatcher, signal: AbortSignal.timeout(40000) });
      if (res.ok) return res.json();
      last = new Error('HTTP ' + res.status);
    } catch (error) {
      last = error;
    }
    await sleep(800 * 2 ** i);
  }
  throw last;
}

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 });
const rows = await sql.unsafe(`
  SELECT d.slug, COALESCE(t_en.name, t_zh.name, d.slug) AS name
    FROM developers d
    LEFT JOIN developer_texts t_en ON t_en.developer_slug = d.slug AND t_en.locale = 'en'
    LEFT JOIN developer_texts t_zh ON t_zh.developer_slug = d.slug AND t_zh.locale = 'zh'
   WHERE d.image_url IS NOT NULL AND d.image_url NOT LIKE '/%'
   ORDER BY d.slug LIMIT 14
`);

for (const row of rows) {
  try {
    const data = await get(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(row.name)}`
    );
    const top = (data.search ?? [])
      .map((s) => `${s.id}:${s.label}=${(s.description ?? '').slice(0, 34)}`)
      .join(' | ');
    console.log(`${row.slug}  [${row.name}]\n   ${top || '（无结果）'}`);
  } catch (error) {
    console.log(`${row.slug} [${row.name}] → 失败 ${error.message}`);
  }
  await sleep(500);
}
await sql.end();
