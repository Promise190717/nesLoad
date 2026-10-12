/*
 * 设备判定：**移动端**（手机 / 平板）还是桌面端。
 *
 * ⚠️ 刻意**不看窗口宽度**（用户 2026-10-12 明确要求）：窗口宽度回答的是「现在有多宽」，
 * 而这里要回答的是「手上是什么设备」—— 桌面端把窗口拉窄、平板横屏，两者都会让宽度撒谎。
 * 所以只认 UA 和触摸能力。
 *
 * 判定结果**不活在 React 里**：首屏由 layout.tsx 的内联脚本 BOOT_INIT 写到
 * `<html data-mobile>`（`'on'` / `'off'`），CSS 直接按属性切 —— 和主题 / 吊灯 /
 * 简洁模式 / 电视机尺寸同一套路（DOM 属性是唯一真相，React 那份只为了分支渲染）。
 * 为什么必须走内联脚本：写在 effect 里会先画一帧**桌面房间**，手机上看着就是「闪一下」。
 *
 * ⚠️ 下面这段判定逻辑在 BOOT_INIT 里**手抄了一份**（内联脚本没法 import）——
 * 改这里必须同步 `app/layout.tsx`。
 */

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  /*
   * Chromium 的 UA-CH：最干净的一条，`navigator.userAgentData.mobile` 直接就是布尔。
   * 有它就信它（比在 UA 字符串里捞关键词准得多）。
   */
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;

  const ua = navigator.userAgent;
  // 手机 / 安卓平板：UA 里一定带这些词之一（`Android` 单拎出来是为了不带 Mobile 的平板）
  if (/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
  /*
   * iPadOS 13 起把自己报成 macOS 的 Safari（UA 里写的是 `Macintosh`），UA 这条路认不出来，
   * 只能靠触摸点数：真的 Mac 桌面机 `maxTouchPoints` 是 0，iPad 是 5。
   * 用 `> 1` 而不是 `> 0`，顺带避开「带触屏的 Windows 笔记本」那类误判（那些 UA 不是 Macintosh）。
   */
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;

  return false;
}

/**
 * 读 `<html data-mobile>`。
 *
 * 属性缺失时**退回现场判定**（内联脚本被 CSP 拦下、或者在 SSR 之后被手动调用）——
 * 宁可多算一次，也不要因为一个属性没写上就整页走错分支。
 */
export function readMobileFlag(): boolean {
  if (typeof document === 'undefined') return false;
  const value = document.documentElement.dataset.mobile;
  if (value === 'on') return true;
  if (value === 'off') return false;
  return isMobileDevice();
}
