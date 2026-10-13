'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile 人机验证挂件（2026-10-13 加）。
 *
 * 挂在哪：前台账号表单（`components/AuthForm.tsx`）里，口令下面、提交钮上面。
 * 那张表单有**两个落点**（屋里那个账号浮层 / 独立登录页 `/login`），
 * 挂件跟着表单走，所以两处一起有了，不用各接一次。
 *
 * **为什么是「显式渲染」（`render=explicit`）而不是贴一段 `<div class="cf-turnstile">`**：
 *   · 隐式渲染是脚本扫到 class 自己画，**画完就不受我们控制** —— 提交失败后 token
 *     已经作废，得换一张，隐式模式下只能靠再扫一次 DOM，React 里很别扭。
 *   · 显式模式我们能拿到 `widgetId`，提交完调一次 `reset()` 就换新的。
 *
 * **token 是一次性的**：用掉 / 过期（默认 300 秒）/ 刷新页面都会作废。
 * 所以调用方**每次提交完（无论成败）都要把 `resetSignal` +1** —— 见 AuthForm 的 submit。
 *
 * ⚠️ 本组件**不读 env**：站点密钥由调用方传（`siteKey`）。这样「要不要开验证」
 *    这个判断只留在 AuthForm 一处，别在这里再判一遍（两处判断迟早会漂）。
 *
 * 脚本地址固定，Cloudflare 明确要求**不要**用固定的 api.js（它一直在变），
 * 带上 `?render=explicit` 才是显式模式。
 */

/** Turnstile 脚本地址。`render=explicit` = 显式渲染（见文件头）。 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** 全局脚本注入的对象。只声明我们用到的那几个方法。 */
interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      /** ⚠️ **带错误码**（`'110200'` 这种），别写成无参 —— 排查全靠它，见下面的注释。 */
      'error-callback'?: (code: string) => void;
      'timeout-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
      language?: string;
      size?: 'normal' | 'compact' | 'flexible';
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * 脚本加载的**模块级单例** —— 挂件可能被挂载多次（表单切登录 / 注册、面板开合），
 * 每次插一个 `<script>` 会加载好几遍。存一个 Promise，谁先来谁负责加载，后来的一起等。
 *
 * 失败时**把 Promise 清掉**，让下一次挂载能重试 —— 不然一个网络抖动就把这一页
 * 永久钉在「没有验证码」的状态上，直到用户刷新。
 */
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('turnstile-script-failed'));
      };
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

export interface TurnstileWidgetProps {
  /** 站点密钥（`NEXT_PUBLIC_TURNSTILE_SITE_KEY`）。由调用方传，本组件不读 env。 */
  siteKey: string;
  /** 解出验证码：拿到 token。⚠️ 一次性，见文件头。 */
  onToken: (token: string) => void;
  /**
   * token 作废了（过期 / 出错 / 超时 / 脚本压根没加载出来）。
   * 调用方应当**清掉手里的 token** —— 否则会拿一个死 token 去提交，白挨一次失败。
   */
  onExpire: () => void;
  /** 递增这个数就重置挂件、换一张新 token。**提交完（无论成败）都要 +1**。 */
  resetSignal: number;
  /** 挂件自己那几行文案的语言（`'zh-cn'` / `'en'`）。不传由 Cloudflare 按浏览器语言猜。 */
  language?: string;
  /** 配色。本站是深色的（ink-950 / ink-800），所以默认 `dark`。 */
  theme?: 'light' | 'dark' | 'auto';
}

export default function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
  resetSignal,
  language,
  theme = 'dark',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 渲染出来的 widgetId，重置 / 摘除都要用它。null = 还没渲染成功。 */
  const widgetIdRef = useRef<string | null>(null);

  /*
   * 回调塞进 ref：`render()` 只在挂载时跑一次，但它拿到的回调是**那一刻的闭包**。
   * 不塞 ref 的话，父级重渲染（比如用户正在打字）换了新的 onToken，挂件里那份还是旧的。
   */
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  // ---- 渲染（挂载时一次；siteKey / 语言 / 主题变了就重来一遍）----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void loadScript()
      .then(() => {
        // 组件已经卸载，或者脚本加载期间又跑了一轮 effect
        if (cancelled || widgetIdRef.current || !window.turnstile || !containerRef.current) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          language,
          // flexible：跟着容器宽度伸缩。面板窄（手机）时不会溢出
          size: 'flexible',
          callback: (token) => onTokenRef.current(token),
          // 两种「这张 token 没了」的收场，对调用方是同一件事：清掉手里的
          'expired-callback': () => onExpireRef.current(),
          'timeout-callback': () => onExpireRef.current(),
          /*
           * 出错。**错误码一定要打出来** —— 挂件自己那句提示（「无法连接到网站」之类）
           * 只说现象不说原因，而码是能直接定位的：
           *   110100 / 110110 / 400020  站点密钥错（抄错 / 建错 widget）
           *   110200                    当前域名不在 Hostnames 白名单里（localhost 最常撞）
           *   110600 / 200100           访客时钟不对，或者被中间层缓存了挑战
           *   200500                    iframe 加载不出来 —— challenges.cloudflare.com 连不上
           *                             （国内网络最常撞的就是这个）
           *   300* / 600*               被判定成 bot 行为
           * 本站对「载入失败」一贯是静默 + console 日志（见 ConsoleScreen 的注释），这里同一规矩。
           */
          'error-callback': (code) => {
            console.error('[turnstile] 挂件报错，错误码：', code);
            onExpireRef.current();
          },
        });
      })
      .catch((error) => {
        /*
         * 脚本没加载出来（网络 / 被扩展拦掉 / challenges.cloudflare.com 被墙）。
         * 当「验证服务不可用」处理：清掉 token，提交时会被拦下并提示重试 ——
         * 比默默放过一次没有验证的提交安全。
         * ⚠️ 必须打日志：这种情况挂件根本不会出现，界面上一点痕迹都没有，
         *    console 是唯一的排查入口（同 ConsoleScreen 那套）。
         */
        console.error('[turnstile] 脚本加载失败（challenges.cloudflare.com 可能连不上）：', error);
        if (!cancelled) onExpireRef.current();
      });

    return () => {
      cancelled = true;
      // 卸载时把挂件摘掉。⚠️ 必须 try/catch —— 脚本没加载出来时 window.turnstile 是 undefined
      try {
        if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* 摘不掉就算了，容器本身也跟着没了 */
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, theme, language]);

  /*
   * ---- 重置 ----
   * 跳过首次（挂载那一次是上面的 render 负责，不用重置）。判据用 `widgetIdRef`：
   * 它为空说明还没渲染成功，这时候 reset 也没东西可重置。
   */
  useEffect(() => {
    if (!widgetIdRef.current) return;
    try {
      window.turnstile?.reset(widgetIdRef.current);
    } catch {
      /* 重置失败不影响下次提交：调用方已经在提交后把 token 清空了 */
    }
  }, [resetSignal]);

  /*
   * `min-h-[65px]` 是给挂件占位：脚本加载出来之前容器是空的，
   * 不留高度的话表单会「先塌下去、再撑开」跳一下（flexible 尺寸约 65px 高）。
   */
  return <div ref={containerRef} className="min-h-[65px]" />;
}
