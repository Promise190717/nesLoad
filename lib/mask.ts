/*
 * 对外展示用的用户名脱敏。
 *
 * 站上的用户名**就是注册邮箱**（`app/api/user/register/route.ts` 里 `const username = email`），
 * 所以「别人能看到的名字」天然是隐私泄漏点 —— 2026-11-06 用户在游戏详情页的评论里
 * 看到整条邮箱，要求截掉域名、把中间几个字符换成星号。
 *
 * 规则（照用户原话「截取 @ 前面的，然后中间一些字符改成星号」）：
 *   · 只处理**像邮箱**的输入（含 `@`、且 `@` 不在开头）。没有 `@` 的名字原样返回 ——
 *     现在的账号都是邮箱，这条主要是给历史数据、以及以后允许自定义昵称留口子。
 *   · `@` 连同域名一起丢掉：域名对认人没有帮助，留着反而把「用的哪家邮箱」也泄出去。
 *   · 局部名保留首尾各一个字符，中间**等长**换成 `*`：`alice` → `a***e`。
 *     不用「固定三颗星」是因为 `ab` 会变成比原名还长的 `ab***`，看着像坏数据；
 *     等长还有个好处：一眼能看出原名大概多长（但没有可用信息）。
 *   · 1 个字符没得遮，原样返回；2 个字符遮掉后一个（`ab` → `a*`）——
 *     只留首尾等于把原名原样打出来。
 *
 * ⚠️ 只用在**对外**那一道（接口出网 / 页面展示）。后台（admin）看到的是真名，
 *    别在那条路上调这个函数。
 */
export function maskUserName(raw: string): string {
  const name = raw.trim();
  const at = name.indexOf('@');
  if (at <= 0) return name;

  /* 按码位切，别用 length / slice：局部名里万一带 emoji，半个代理对会画成方块 */
  const chars = Array.from(name.slice(0, at));
  if (chars.length === 1) return chars[0];
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}
