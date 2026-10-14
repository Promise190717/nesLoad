/*
 * 邮箱校验 —— **注册**用的那一份规则（2026-10-14 加）。
 *
 * ⚠️ **前台和后台共用这一个文件**：`components/AuthForm.tsx`（客户端，提交前先挡一道）
 *    和 `app/api/user/register/route.ts`（服务端，兜底）都 import 这里。
 *    两端规则必须一字不差，所以不能各自手写一份正则。
 *
 * ⚠️ **只管注册，登录完全不经过这里** —— 老账号的用户名可能根本不是邮箱
 *    （2026-10-14 之前注册的号是 3–20 位字母数字），登录侧拦掉等于把人锁在门外
 *    （和口令空格那条取舍同一个道理，见 lib/server/app-users.ts 的 validatePassword）。
 *
 * 为什么不引用第三方库：规则本身就几条（格式 / 别名 / 临时域），引一个
 * disposable-email 域名库反而给客户端 bundle 拖上几千个域名字符串。
 * 名单在 DISPOSABLE_DOMAINS，**会过时** —— 发现新的临时邮箱域名就往里加。
 */

/** 校验结果的错误键。`null` = 通过。调用方拼成 `email-<键>` 回给前端查 i18n。 */
export type EmailError = 'invalid' | 'alias' | 'temp';

/*
 * local part 允许的字符（RFC 5322 的 atom + 点号，**不含引号串** —— 那种
 * `"a b"@x.com` 的写法现实中没人用，放进来只会给反爬开洞）。
 * `+` 也在表内 —— 别名校验在格式之后单独做，这样错误码能区分「格式不对」和「别名」。
 */
const LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9-]+$/;

/** 总长上限（RFC 5321）。超长按「格式不对」处理，不值得单独一个错误码。 */
const EMAIL_MAX = 254;
const LOCAL_MAX = 64;
const DOMAIN_MAX = 253;

/**
 * 本地部分里的点会被 Gmail 归一化（`a.b@gmail.com` = `ab@gmail.com`）——
 * 这是**别名**，不是两个账号。只有 Gmail 系这么干，别家的点号是真实的不同地址。
 */
const DOT_INSENSITIVE_DOMAINS: readonly string[] = ['gmail.com', 'googlemail.com'];

/*
 * 临时 / 一次性邮箱域名黑名单（小写，**不带 @**）。
 *
 * 名单来源：各家开源 disposable 域名表里出现频率最高的一批 + 中文的常见临时邮箱
 * + 匿名转发服务（那些发的其实是「别名」，一并挡掉）。
 * ⚠️ 判域名时**会连子域一起判**（`xx.mailinator.com` 命中 `mailinator.com`，
 *    见 `isDisposableDomain`）—— 所以只要列主域就行，不用枚举子域。
 * ⚠️ 名单**不追求穷尽**：临时邮箱域名每天在冒新的，这份名单挡的是「随手搜一个
 *    临时邮箱来注册」的人；真想绕的人连 Turnstile 都会解。要更严就接
 *    Cloudflare / Kickbox 那类实时 API，那是另一个量级的改动。
 */
const DISPOSABLE_DOMAINS: readonly string[] = [
  /* —— 国际常见的临时邮箱 —— */
  'mailinator.com',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'spam4.me',
  'temp-mail.org',
  'temp-mail.io',
  'temp-mail.pl',
  'tempmail.com',
  'tempmail.net',
  'tempmail.plus',
  'tempmailo.com',
  'tempmailaddress.com',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'getnada.com',
  'nada.email',
  'dispostable.com',
  'maildrop.cc',
  'mintemail.com',
  'trashmail.com',
  'trashmail.net',
  'trash-mail.com',
  'wegwerfmail.de',
  'fakeinbox.com',
  'mailnesia.com',
  'tempinbox.com',
  'mailcatch.com',
  'emailondeck.com',
  'moakt.com',
  'mvrht.net',
  'mytemp.email',
  'burnermail.io',
  'mail.tm',
  'snapmail.cc',
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  'esiix.com',
  'wwjmp.com',
  'xojxe.com',
  'yoggm.com',
  'mohmal.com',
  'throwawaymail.com',
  'mailsac.com',
  'inboxkitten.com',
  'harakirimail.com',
  'mailde.de',
  'mail7.io',
  'tempmail.dev',
  'dropmail.me',
  /* —— 中文圈常见的临时邮箱 —— */
  'linshiyouxiang.net',
  'bccto.me',
  'chaifen.me',
  '027168.com',
  'fmail.co',
  /* —— 匿名转发 / 别名服务（发的本质是别名，一并挡）—— */
  'duck.com',
  'privaterelay.appleid.com',
  'mozmail.com',
  'aleeas.com',
  'slmail.me',
  '8shield.net',
  'anonaddy.com',
  'anonaddy.me',
  'addymail.com',
];

/**
 * 域名（或它的任意父域）在不在临时名单里。
 * 走父域是因为临时邮箱服务常拿子域发信（`xx.mailinator.com`）——
 * 名单里列主域就够了。
 */
function isDisposableDomain(domain: string): boolean {
  let candidate = domain;
  for (;;) {
    if (DISPOSABLE_DOMAINS.includes(candidate)) return true;
    const dot = candidate.indexOf('.');
    /* 已经是最后一段（TLD）了，没有父域可走 */
    if (dot === -1) return false;
    candidate = candidate.slice(dot + 1);
  }
}

/**
 * 校验一个**已经 trim + 小写化**的邮箱地址。
 *
 * 判序：**格式 → 别名 → 临时域**。格式不对的邮箱谈不上别名，别名命中就没必要
 * 再查域名 —— 报最贴近病因的那一条。
 *
 * ⚠️ 入参**必须先做 `trim().toLowerCase()`**（本函数不做归一化）：注册侧存库前
 *    也要小写（`Foo@x.com` 和 `foo@x.com` 该是同一个账号），归一化放在调用方，
 *    这里只负责「像不像一个能收信的邮箱」。
 */
export function validateEmail(raw: string): EmailError | null {
  if (typeof raw !== 'string' || raw.length > EMAIL_MAX) return 'invalid';

  /* 恰好一个 @：local 里不允许 @（正则里没有），domain 里也不允许，所以看长度就够 */
  const at = raw.indexOf('@');
  if (at <= 0 || at !== raw.lastIndexOf('@')) return 'invalid';

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  /* ---- 格式 ---- */
  if (local.length > LOCAL_MAX || domain.length > DOMAIN_MAX) return 'invalid';
  if (!LOCAL_PATTERN.test(local)) return 'invalid';
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return 'invalid';

  const labels = domain.split('.');
  if (labels.length < 2) return 'invalid';
  for (const label of labels) {
    if (!label || label.length > 63) return 'invalid';
    if (!DOMAIN_LABEL_PATTERN.test(label)) return 'invalid';
    if (label.startsWith('-') || label.endsWith('-')) return 'invalid';
  }
  /* TLD 至少两个字母（兼容 `xn--xx` 这种 punycode 国际 TLD） */
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith('xn--')) return 'invalid';

  /* ---- 别名 ---- */
  if (local.includes('+')) return 'alias';
  if (DOT_INSENSITIVE_DOMAINS.includes(domain) && local.includes('.')) return 'alias';

  /* ---- 临时域 ---- */
  if (isDisposableDomain(domain)) return 'temp';

  return null;
}
