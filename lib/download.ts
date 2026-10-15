'use client';

/*
 * 把文件甩给浏览器下载的**唯一出口**。
 *
 * 两个调用点：下载页那颗钮（components/RomDownloadGate.tsx，地址是同源代理
 * `/api/games/<id>/rom`）、以及存档写不进 IndexedDB 时那份兜底
 * （lib/emulator.ts 的 downloadBattery）。以后再要「下载个什么」，也走这里 ——
 * **别自己再造一个 `<a download>`**，理由见下面这一段。
 *
 * ⚠️⚠️ **为什么必须掐掉冒泡**（这个函数存在的全部理由）：
 *
 * 顶部那条路线进度条（app/layout.tsx 里挂的 nextjs-toploader）是**挂在 `document` 上的
 * 点击代理**：任何同源 `<a>` 被点一下，它都当成「要换页了」立刻起条，然后等
 * `history.pushState` 被写一次来收尾。可**下载根本不换页** —— 浏览器把整个响应交给
 * 下载器，地址栏一动不动、也没有 pushState —— 那条收尾永远不来，
 * 条子就一直挂在 99%，看着像坏了。
 *
 * 所以：**在这一张自己造的链上 `stopPropagation`**，让 `document` 压根收不到这一下。
 * 掐掉的是冒泡、不是默认行为 —— 文件该下还是下。
 *
 * （方向要分清：全站另外三处 —— 被确认框拦下的点击、语言下拉、退出登录 —— 是
 * **手动补** `start()`/`done()`，因为它们确实要换页、只是这个包听不见；
 * 这里正相反，**不换页的动作要让条子连起都别起**。）
 *
 * ⚠️ 也别图省事写成「先让它起、再喊一句 `done()` 收掉」：nprogress 的 `done()` 是
 * **从当前位置扫到 100% 再淡出**，压在这一下点击上就是一条横穿屏幕的亮条 ——
 * 与修掉它的初衷正好相反。
 *
 * **为什么是 `<a download>` 而不是 fetch**：几十 MB 的二进制走 fetch 得先在内存里
 * 攒完再转 Blob，白占一份内存、还丢掉了浏览器原生的下载管理（进度 / 暂停 / 续传）。
 * 造链 + 点一下，和用户自己点链接完全等价。
 */

/**
 * 把 `source` 存成 `filename`。
 *
 * @param source 同源地址（流式下载，不占内存）或一份已经攒好的 Blob
 * @param filename 存进下载目录的文件名。传地址时它会**顶掉**服务端 Content-Disposition
 *                 给的名字（`download` 属性对同源地址才生效，全站下载都走同源）
 */
export function downloadFile(source: string | Blob, filename: string) {
  const isBlob = typeof source !== 'string';
  const href = isBlob ? URL.createObjectURL(source) : source;

  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  // 见文件头：让这一下点击在链上就停住，别惊动 document 上那个顶栏进度条
  anchor.addEventListener('click', (e) => e.stopPropagation());

  /*
   * 必须挂进文档再点：Firefox 不认**游离节点**上的 `download`（点下去悄无声息）。
   */
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Blob 的 objectURL 得手动放掉，否则跟着这个页面一直占着（几十 MB 也不回收）
  if (isBlob) URL.revokeObjectURL(href);
}
