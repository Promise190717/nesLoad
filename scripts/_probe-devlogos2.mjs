// 临时探针：R2 上开发者 logo 的上传时间 + svg 是否依赖 DTD 实体（验完删）
const base = 'https://games.retrogamesonline.fun';
const names = ['capcom', 'konami', 'nintendo', 'snk', 'sega', 'ea-games', 'square-enix', 'square', 'technos-japan', 'community-developer'];

for (const name of names) {
  for (const ext of ['svg', 'jpg', 'png', 'webp']) {
    const url = `${base}/images/developers/${name}.${ext}`;
    const res = await fetch(url);
    if (res.status !== 200) {
      await res.body?.cancel?.();
      continue;
    }
    const txt = await res.text();
    const entityNs = txt.includes('xmlns="&');
    const entityDecl = /<!ENTITY/i.test(txt);
    console.log(
      name.padEnd(20),
      ext.padEnd(4),
      'len=' + String(txt.length).padEnd(7),
      'last-mod=' + (res.headers.get('last-modified') ?? '-'),
      'entityNs=' + entityNs,
      'ENTITYdecl=' + entityDecl
    );
    break;
  }
}
