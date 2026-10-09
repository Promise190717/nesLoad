'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

/** 后台登录。令牌由 /api/admin/login 下发到 HttpOnly Cookie。 */
export default function AdminLoginPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 401) {
        setError(t('admin.login.error'));
        return;
      }
      if (!res.ok) {
        setError(t('admin.login.failed'));
        return;
      }
      router.replace('/admin');
      router.refresh();
    } catch {
      setError(t('admin.login.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-ink-800 pixel-edge pxw-4 pxc-600 w-[360px] max-w-full p-5"
      >
        <h1 className="mb-4 text-[13px] text-ink-200">{t('admin.login.title')}</h1>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[10px] text-ink-400">
            {t('admin.login.username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1 text-[10px] text-ink-400">
            {t('admin.login.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={FIELD_CLASS}
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t('admin.login.submitting') : t('admin.login.submit')}
          </button>
          {error && <span className="text-[11px] text-danger">{error}</span>}
        </div>
      </form>
    </div>
  );
}