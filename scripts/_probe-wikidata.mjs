// 临时探针：看 wbsearchentities 命中哪个实体、有没有 P154/P18（验完删）
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
const undiciDir = readdirSync(pnpmDir).filter((n) => /^undici@\d+\.\d+\.\d+/.test(n)).sort().at(-1);
const { ProxyAgent } = require(join(pnpmDir, undiciDir, 'node_modules', 'undici'));
const dispatcher = new ProxyAgent('http://127.0.0.1:7897');

const get = async (url) => {
  const res = await fetch(url, { dispatcher, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
};

for (const name of ['Acclaim Studios London', 'APE', 'Argonaut Games', 'Capcom']) {
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
    JSON.stringify(hit.description ?? '').slice(0, 40),
    'P154=' + (claims.P154?.[0]?.mainsnak?.datavalue?.value ?? '-'),
    'P18=' + (claims.P18?.[0]?.mainsnak?.datavalue?.value ?? '-'),
    'claimKeys=' + Object.keys(claims).length
  );
}
