// 临时探针 2：带重试地看命中实体 + P154/P18（验完删）
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
      if (res.status === 429) await sleep(8000);
    } catch (error) {
      last = error;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last;
}

for (const name of ['Acclaim Studios London', 'APE', 'Argonaut Games', 'Capcom', 'Atlus']) {
  try {
    const s = await get(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(name)}`
    );
    const hit = s.search?.[0];
    if (!hit) {
      console.log(name, '→ 无结果');
      continue;
    }
    const e = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${hit.id}`);
    const claims = e.entities?.[hit.id]?.claims ?? {};
    console.log(
      name.padEnd(24),
      '→',
      hit.id,
      JSON.stringify(hit.description ?? '').slice(0, 45),
      'P154=' + (claims.P154?.[0]?.mainsnak?.datavalue?.value ?? '-'),
      'P18=' + (claims.P18?.[0]?.mainsnak?.datavalue?.value ?? '-'),
      'claims=' + Object.keys(claims).length
    );
  } catch (error) {
    console.log(name, '→ 失败', error.message);
  }
  await sleep(700);
}
