// 临时探针：看上游 developers 列表页里 logo 的真实地址形态（验完删）
const res = await fetch('https://retrogamesnexus.com/developers', {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  },
});
const html = await res.text();
console.log('status', res.status, 'len', html.length);

const urls = new Set(html.match(/https?:\/\/[^"'\\\s]*developers?[^"'\\\s]*\.(?:png|jpg|jpeg|webp|svg)/gi) ?? []);
const rels = new Set(html.match(/\/images\/[^"'\\\s]*\.(?:png|jpg|jpeg|webp|svg)/gi) ?? []);
console.log('abs urls', urls.size, [...urls].slice(0, 8));
console.log('rel paths', rels.size, [...rels].slice(0, 8));
