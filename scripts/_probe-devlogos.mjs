// 临时探针：看开发者 logo 到底能不能被浏览器解码（验完删）
const base = 'https://games.retrogamesonline.fun';
const names = [
  'capcom', 'konami', 'nintendo', 'snk', 'sega', 'ea-games', 'square-enix',
  'square', 'technos-japan', 'bandai-namco-entertainment', 'taito', 'gamefreak', 'hal-laboratory',
];
const NS = 'xmlns="http://www.w3.org/2000/svg"';

for (const name of names) {
  for (const ext of ['svg', 'jpg', 'png', 'webp']) {
    const res = await fetch(`${base}/images/developers/${name}.${ext}`);
    if (res.status !== 200) {
      await res.body?.cancel?.();
      continue;
    }
    const txt = await res.text();
    const head = txt.slice(txt.indexOf('<svg'), txt.indexOf('<svg') + 80);
    console.log(
      name.padEnd(28),
      ext.padEnd(4),
      `bytes=${String(txt.length).padEnd(7)}`,
      `ns=${txt.includes(NS)}`,
      `| ${JSON.stringify(head)}`
    );
    break;
  }
}
