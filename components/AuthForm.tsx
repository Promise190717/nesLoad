'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import { rememberCurrentUser, type AuthUser } from '@/lib/current-user';
import { validateEmail } from '@/lib/email';
import type { Locale } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import TurnstileWidget from './TurnstileWidget';

/**
 * 前台账号的**登录 / 注册表单**（2026-10-13 从 `UserPanel` 里抽出来）。
 *
 * **为什么抽出来**：同一张表单现在有**两个落点** ——
 *   · 屋里那颗账号钮弹出来的浮层（`components/UserPanel.tsx`）
 *   · 独立的登录页（`app/[locale]/login/page.tsx`，2026-10-13 加）
 * 各写一份的话，改一处（比如加一条口令规则、多一个错误码）另一处就会不知不觉地不跟。
 * 这里只管**表单本身**，外壳（浮层的标题栏 / 页面的标题与返回）由调用方给。
 *
 * **口令规则提示当 `placeholder` 用**（2026-10-13 用户要求「提示放在 input 里面」）：
 * 注册模式给两个输入框填 placeholder，登录模式**不填**（登录的人不需要知道规则）。
 * 口令里**不许有空白字符** —— 注册模式在 `onChange` 里就吃掉，登录模式**刻意不吃**
 * （老账号的口令可能真带空格）。服务端那侧见 `lib/server/app-users.ts` 的 `validatePassword`；
 * 改密码那页（`components/AccountCenter.tsx` 的 PasswordTab）是同一套规则，改一处记得看另一处。
 *
 * **注册账号 = 邮箱**（2026-10-14 起）：注册模式的第一个框收邮箱 —— 格式 / 别名
 * （`+` 后缀、Gmail 加点）/ 临时域三道检查，规则本体在 `lib/email.ts`（前后端共用
 * 同一份，前端先挡一道省一次往返）。**登录完全不校验邮箱**（用户明确要求）——
 * 老账号的用户名可能根本不是邮箱，登录框照旧收任何字符串。注册时输入会被
 * `onChange` 顺手转小写（服务端存库也小写，两边口径一致）。
 *
 * ⚠️ **和后台账号毫无关系** —— 这里的账号住 `app_users` 表、cookie 是 `nesload_user`，
 *    和 `/admin` 那套（`users` 表 + `nesload_admin`）完全隔离。界面文案里也不要暗示
 *    两者有关联（比如别写「同一个账号也能登后台」）。
 *
 * 表单里**不做跳转**：登录成功只回调 `onAuthed`。浮层那边要留在原地换成「已登录」
 * 那一屏，登录页那边要导航走 —— 两种收场差得远，交给调用方决定。
 *
 * ⚠️ **「我是谁」那套探测搬去了 `lib/current-user.ts`**（2026-10-19）：它现在带缓存，
 *    不再是「谁想用谁自己 fetch 一次」的东西。`AuthUser` 类型也跟着搬过去了。
 */

export interface AuthFormProps {
  /** 登录 / 注册成功。调用方据此刷新自己的 user 状态（浮层）或导航（登录页）。 */
  onAuthed: (user: AuthUser) => void;
  /**
   * 不渲染表单里那句「登录之后…即刻开玩！」（`user.formLead`）。
   * `/login` 页头已经说过同一句（`login.lead`），那边传 true 免得同屏重复；
   * 屋里的浮层什么都不传 —— 浮层没有页头，就靠表单里这句讲好处。
   */
  hideCloudLead?: boolean;
}

/**
 * 输入框。
 *
 * ⚠️ **高度是原样（约 34px），别再动它**：2026-10-13 用户先嫌「表单高度太小」，
 * 把这里放大到 `py-3 text-[13px]`（约 42px）—— 用户当场反馈「输入框太大了」，
 * 又退回原尺寸。**「表单要高一点」这件事改由间距承担**（见下面 form / label 的 gap），
 * 不要再从输入框本身找高度。
 */
const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

/**
 * 表单下面那句法律声明里**两个链接**的样式。
 *
 * 虚线下划线而不是实线 / accent 色：这是「小字里的链接」，比正文亮一档就够，
 * 抢了 accent 会和上面的模式切换、下面那颗提交钮打架。
 */
const CONSENT_LINK_CLASS =
  'text-ink-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-accent';

/**
 * 人机验证的**站点密钥**（`NEXT_PUBLIC_TURNSTILE_SITE_KEY`）。
 *
 * 空串 = **没开验证**：不画挂件、提交时也不带 token（服务端那边同步跳过，
 * 见 `lib/server/turnstile.ts` 的文件头 —— 两个 env 各判各的，谁都不读另一个）。
 *
 * ⚠️ 必须是**字面量**写法 `process.env.NEXT_PUBLIC_xxx`：Next 只在构建期做静态替换，
 *    写成 `process.env[name]` 会取不到值（同 lib/netplay.ts 的 TURN 那几个）。
 */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const CAPTCHA_ENABLED = TURNSTILE_SITE_KEY !== '';

/**
 * 人机验证框的语言 —— **Cloudflare Turnstile 自己那套码**，不是我们的 `Locale`。
 *
 * 它只认这几个（小写、连字符写法），所以不能直接拿 `locale` 拼；也不能用
 * `lib/i18n.ts` 的 `dateLocale()` / `htmlLang()` —— 那两个是给 `Intl` / `hreflang` 用的，
 * 恰好这里三种都不同名（`zh-cn` vs `zh-CN`）。
 *
 * ⚠️ 2026-10-16 加日韩时补了后两项；**2026-10-20 扩到 18 种语言时补齐其余 14 项**
 *    （`zh-TW` 对应 `zh-tw`，`fil` 对应 `fil`，其余按「语言-地区」写法）。
 *    加语言时这里要跟着补 —— 漏掉的话验证框会退回 Turnstile 的默认语言（英文），
 *    中文用户当年就是这么发现的（见下面那段注释）。
 *    查表：https://developers.cloudflare.com/turnstile/reference/supported-languages/
 */
const TURNSTILE_LANG: Record<Locale, string> = {
  en: 'en',
  zh: 'zh-cn',
  'zh-TW': 'zh-tw',
  ja: 'ja',
  ko: 'ko',
  es: 'es-ES',
  hi: 'hi',
  pt: 'pt-BR',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ru: 'ru',
  fil: 'fil',
  nl: 'nl',
  vi: 'vi',
  th: 'th',
  ms: 'ms',
  id: 'id',
};

type Mode = 'login' | 'register';
type Notice = { tone: 'ok' | 'error'; text: string };

/**
 * 服务端返回的错误码 → 文案键。
 *
 * 服务端故意只回码不回句子（见 app/api/user/register/route.ts）—— 它不知道用户在用哪种语言。
 * 认不出来的码一律退回 `user.error.failed`，别把 `username-too-long` 这样的原文摆到界面上。
 */
const ERROR_KEYS: Record<string, string> = {
  'username-invalid': 'user.error.usernameInvalid',
  'username-too-short': 'user.error.usernameTooShort',
  'username-too-long': 'user.error.usernameTooLong',
  'username-taken': 'user.error.usernameTaken',
  /* 注册邮箱校验（2026-10-14 起）。规则本体 lib/email.ts，服务端回 `email-<键>` */
  'email-invalid': 'user.error.emailInvalid',
  'email-alias': 'user.error.emailAlias',
  'email-temp': 'user.error.emailTemp',
  'password-invalid': 'user.error.passwordInvalid',
  'password-too-short': 'user.error.passwordTooShort',
  'password-too-long': 'user.error.passwordTooLong',
  /* 口令里有空格 —— 注册会回这个码（改密码那页另有一份，见 AccountCenter 的 keys 表） */
  'password-has-space': 'user.error.passwordHasSpace',
  'invalid-credentials': 'user.error.invalidCredentials',
  banned: 'user.error.banned',
  'missing-credentials': 'user.error.missingCredentials',
  /* 人机验证（见 lib/server/turnstile.ts）。`required` = 没解出验证码就点了提交，
     `failed` = 解出来了但服务端不认（过期 / 用过了 / 是脚本伪造的） */
  'captcha-required': 'user.error.captchaRequired',
  'captcha-failed': 'user.error.captchaFailed',
};

export default function AuthForm({ onAuthed, hideCloudLead = false }: AuthFormProps) {
  const { t, locale, href } = useI18n();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 当前解出来的验证码 token。空串 = 还没解 / 已经用掉。 */
  const [captchaToken, setCaptchaToken] = useState('');
  /** 递增它就重置挂件、换一张新 token（见 TurnstileWidget 的 resetSignal）。 */
  const [captchaReset, setCaptchaReset] = useState(0);

  /** 把服务端的错误码翻成当前语言的句子。 */
  const messageOf = useCallback(
    (code: string, fallback: string) => {
      const key = ERROR_KEYS[code];
      return key ? t(key as Parameters<typeof t>[0]) : fallback;
    },
    [t]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    /*
     * 注册模式先做**本地邮箱校验**（2026-10-14）—— 格式 / 别名 / 临时域三道
     * 都在 `lib/email.ts`（和服务端同一份规则）。这里先挡一道，省一次白跑的
     * 往返，提示也更直接；服务端会再验一遍（它才是权威）。
     * ⚠️ 只在注册模式做：**登录不校验邮箱**（用户明确要求）—— 老账号的用户名
     *    可能根本不是邮箱，登录框里填什么原样发给服务端。
     */
    if (mode === 'register') {
      const emailError = validateEmail(username.trim().toLowerCase());
      if (emailError) {
        const keys = {
          invalid: 'user.error.emailInvalid',
          alias: 'user.error.emailAlias',
          temp: 'user.error.emailTemp',
        } as const;
        setNotice({ tone: 'error', text: t(keys[emailError]) });
        return;
      }
    }

    /*
     * 没解出验证码就别发请求 —— 服务端也会拦（回 `captcha-required`），
     * 但那是一次白跑的往返。这里先挡一道，提示也更直接。
     * 挂件加载不出来时 token 一直是空的，用户会看到这句「请先完成人机验证」——
     * 比按钮点了没反应强（挂件本身也会显示 Cloudflare 的报错）。
     */
    if (CAPTCHA_ENABLED && !captchaToken) {
      setNotice({ tone: 'error', text: t('user.error.captchaRequired') });
      return;
    }

    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(mode === 'login' ? '/api/user/login' : '/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 没开验证时 `turnstileToken` 是空串，服务端不配密钥就跳过校验（见 lib/server/turnstile.ts）
        body: JSON.stringify({ username, password, turnstileToken: captchaToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        throw new Error(messageOf(data.error ?? '', t('user.error.failed')));
      }
      // 口令不要在内存里多留 —— 成功之后立刻清掉
      setPassword('');
      /*
       * 先把「我是谁」的缓存盖成这个人（`lib/current-user.ts`）——
       * 否则接下来 5 分钟里，切一次页面顶栏还会画成「登录」。
       */
      rememberCurrentUser(data.user);
      onAuthed(data.user);
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('user.error.failed'),
      });
    } finally {
      /*
       * token 是**一次性**的 —— 这一轮请求已经把它用掉了（或者本来就是个死 token）。
       * 无论成败都换一张新的，否则用户改完用户名再点一次，拿的是同一个 token，
       * 必然又被判 `captcha-failed`。
       */
      setCaptchaToken('');
      setCaptchaReset((n) => n + 1);
      setBusy(false);
    }
  };

  /** 切登录 / 注册：**顺手清掉提示和口令** —— 那句报错说的是上一个模式的事。 */
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setNotice(null);
    setPassword('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        两个模式的切换。**纯文字**，不是实心分段控件。

        ⚠️ 这里走过一版弯路：2026-10-13 用户先说「切换可以显眼一点」，做成了键位面板
        那种实心分段控件（选中那格是块琥珀）—— 用户当场反馈「太显眼了」，退回纯文字。
        现在只在两处加码，别的照旧：
          · 字号 11px → 13px（原来那行字太小，混在表单里根本看不出是个「切换」）；
          · 选中那条下面一道 2px 琥珀短线（用 `opacity` 切，不占额外布局）。
        ⚠️ 要再「显眼」也别回到实心底 —— 那会把下面那颗琥珀提交钮压掉。
      */}
      <div className="flex items-center gap-5">
        {(['login', 'register'] as const).map((value) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => switchMode(value)}
              className={`relative pb-1 text-[13px] transition-colors ${
                active ? 'text-accent' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {t(value === 'login' ? 'user.tabLogin' : 'user.tabRegister')}
              <span
                aria-hidden
                className={`absolute inset-x-0 bottom-0 h-[2px] bg-accent transition-opacity ${
                  active ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/*
        「登录了能干什么」一句话（2026-10-13 用户要求加回表单，措辞取自 `login.lead`）。
        放在切换行和表单之间：好处要在填表之前说。`/login` 页头已经讲过同一句，
        那边传 `hideCloudLead` 跳过；浮层没有页头，靠这句撑场。
        ⚠️ 这**不是**当年被删的那条 `user.benefits`（「三样东西会跟着你走」）——
        那条还是死的；这条是用户后来点名要的，见 lib/i18n.ts 里 `user.formLead` 的注释。
      */}
      {!hideCloudLead && (
        <p className="text-[12px] leading-relaxed text-ink-500">{t('user.formLead')}</p>
      )}

      {/*
        间距承担「表单高一点」这件事（2026-10-13 用户要求：输入框保持原高、
        用间距把整体撑开）：
          · 切换 ↔ 表单 ↔ 声明：12px → 16px（外层 `gap-4`）
          · 字段之间：12px → 16px（`gap-4`）
          · 标签 ↔ 输入框：6px → 8px（`gap-2`）
      */}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          {/* 注册模式的账号是邮箱（2026-10-14 起），标签 / 提示随模式切；
              登录模式照旧叫「用户名」—— 老账号的用户名不是邮箱 */}
          <span className="text-[12px] text-ink-400">
            {t(mode === 'register' ? 'user.emailLabel' : 'user.username')}
          </span>
          <input
            type="text"
            value={username}
            /*
             * ⚠️ **注册模式顺手转小写**（2026-10-14）—— 服务端存库前也小写
             *    （`Foo@x.com` 和 `foo@x.com` 是同一个账号），两边口径一致；
             *    登录模式**绝不动**：老账号的用户名是区分大小写存的，动了就是
             *    「明明输对了登不上」。
             */
            onChange={(e) => setUsername(mode === 'register' ? e.target.value.toLowerCase() : e.target.value)}
            placeholder={mode === 'register' ? t('user.emailHint') : undefined}
            // 浏览器自带的补全：登录按「账号」补（老账号可能是用户名），注册按「邮箱」补
            autoComplete={mode === 'login' ? 'username' : 'email'}
            inputMode={mode === 'register' ? 'email' : undefined}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[12px] text-ink-400">{t('user.password')}</span>
          <input
            type="password"
            value={password}
            /*
             * ⚠️ **注册模式顺手吃掉空白字符**（2026-10-13 用户要求「移除空格输入」）——
             *    服务端也会回 `password-has-space`（见 lib/server/app-users.ts），
             *    这里先过滤一道，省得用户敲完才发现被拒。
             * ⚠️ **登录模式绝不能过滤** —— 老账号的口令里可能真带空格（禁空格之前建的号），
             *    过滤掉就是「明明输对了登不上」。服务端登录侧同样不校验空格，两边一致。
             */
            onChange={(e) =>
              setPassword(
                mode === 'register' ? e.target.value.replace(/\s/g, '') : e.target.value
              )
            }
            placeholder={mode === 'register' ? t('user.passwordHint') : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={FIELD_CLASS}
          />
        </label>

        {/*
          人机验证。只在配了站点密钥时才画（`NEXT_PUBLIC_TURNSTILE_SITE_KEY`，
          见本文件顶部）—— 本地开发没配密钥时这一块完全不出现，表单和以前一样。
          语言跟着当前界面走（`TURNSTILE_LANG`，它那套码和我们的 `Locale` 不同名），
          别让中文用户看到一个英文的验证框。
        */}
        {CAPTCHA_ENABLED && (
          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            language={TURNSTILE_LANG[locale]}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken('')}
            resetSignal={captchaReset}
          />
        )}

        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}

        {/*
          提交钮：**右对齐**（`self-end`，2026-10-13 用户要求；原来是 `self-start` 靠左）。
          表单是 `flex-col`，所以 `self-end` 就是把它推到右边 —— 和「左标签、右动作」
          的表单习惯一致，也不跟上面那排分段控件抢视觉重心。
        */}
        <button
          type="submit"
          disabled={busy}
          className="pixel-edge pxw-2 pxc-500 mt-1 self-end bg-accent px-3 py-1.5 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? t(mode === 'login' ? 'user.signingIn' : 'user.signingUp')
            : t(mode === 'login' ? 'user.signIn' : 'user.signUp')}
        </button>
      </form>

      {/*
        这里原本有一句「登录了能干什么」（`user.benefits`：「注册之后有三样东西会跟着你走…」）
        —— 2026-10-13 用户要求删掉。**别按「这间屋子本来不需要账号、不说好处没人注册」
        那条理由把它加回来**。上面那句 `user.formLead` 是用户**后来点名要的**（措辞取自
        `login.lead`，不带指路尾句），别把两者混为一谈 —— `benefits` 依旧是死的。
      */}

      {/*
        法律声明（2026-10-13 用户要求「表单下方增加…」）。
        一句话拆成四段拼（`user.consentLogin` / `consentRegister` / `Middle` / `After`），
        中间夹两个**真链接** —— 链接文字直接借 `legal.terms` / `legal.privacy`
        （那两条本来就是两页的标题），所以中英语序的差异由几段自己扛，不用另起键。

        ⚠️ 开头**按模式切**（2026-10-13 用户要求）：这张表两个模式共用，
           注册时还写「登录即表示…」读起来不对。
        ⚠️ 走 `href()` 拼语言前缀，别手写 `/terms` —— 中文站在 `/zh/terms`。
        ⚠️ 字号 2026-10-13 从 10px 提到 11px（用户要求「稍微大点」）。
      */}
      <p className="text-[12px] leading-relaxed text-ink-500">
        {t(mode === 'login' ? 'user.consentLogin' : 'user.consentRegister')}
        <Link href={href('/terms')} className={CONSENT_LINK_CLASS}>
          {t('legal.terms')}
        </Link>
        {t('user.consentMiddle')}
        <Link href={href('/privacy')} className={CONSENT_LINK_CLASS}>
          {t('legal.privacy')}
        </Link>
        {t('user.consentAfter')}
      </p>
    </div>
  );
}
