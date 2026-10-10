import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE,
  isLocale,
  parseAcceptLanguage,
  resolveLocale,
  type Locale,
} from '../i18n';

/*
 * 从「当前这次请求」里解析语言。
 *
 * 解析顺序（服务端与客户端共用同一套规则，所以首屏渲染结果和水合结果必然一致）：
 *   1. cookie —— 用户手动切过语言
 *   2. Accept-Language —— 浏览器设置
 *   3. 英文 —— 一条都没匹配上时的兜底
 *
 * **为什么由服务端读 Accept-Language 而不是客户端读 navigator.language**：
 * 客户端读只能在挂载后 setState，中文用户会先看到一帧英文再翻成中文。
 *
 * 原先这段代码长在 app/layout.tsx 里（只服务 generateMetadata）。抽到这儿是因为
 * 后台也有一处要用它：app/admin/layout.tsx 要给后台页单独设标题，而标题得跟语言走。
 * 两份各写一遍的话，将来改动解析顺序必然只改一处 —— 表现就是「界面中文、后台标题英文」
 * 这种一半对一半的怪相。
 *
 * 代价是**用它的路由都会变成动态渲染**（cookies() / headers() 会退出静态渲染）：
 * 首页本来就要读语言，后台本来就要读 cookie 判登录，两边都不亏。
 * 但这意味着这里**不能**被任何客户端组件 import —— next/headers 在浏览器里不存在。
 * 所以它待在 lib/server/ 而不是 lib/ 下。
 */
export async function readLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  return resolveLocale(parseAcceptLanguage(headerList.get('accept-language')));
}
