'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  LOCALE_COOKIE,
  SITE_NAME,
  translate,
  type Locale,
  type MessageKey,
  type Translate,
} from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * 初始语言由根布局在服务端定好（cookie → Accept-Language → 英文）后传进来。
 * 组件这边不再自己探测 navigator.language —— 那只能等到挂载后才 setState，
 * 中文用户会先看到一帧英文。
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);

    // 写 cookie 而不是 localStorage：服务端下次渲染时能直接读到，
    // 手动切过的语言不会在刷新后被打回浏览器默认值。
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;

    // <html> 由服务端组件渲染，客户端 setState 不会让它重渲染，
    // 所以这两个属性得手动同步 —— 分段开关的高亮和读屏都靠它们。
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.locale = next;
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      /*
       * 站名（文案里的 `{site}` 占位）在这里**统一注入**，不在每个调用点手写。
       * 这样任何写了 `{site}` 的键，无论从服务端（layout 的 translate）还是客户端
       * （这个 t）取，拿到的都是当前语言的站名。
       *
       * 顺序上 vars 在后：调用方传的变量优先级更高，需要时可以覆盖掉站名。
       */
      t: (key: MessageKey, vars) =>
        translate(locale, key, { site: SITE_NAME[locale], ...vars }),
      setLocale,
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内部使用');
  return ctx;
}
