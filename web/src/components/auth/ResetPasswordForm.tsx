'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

// Reached via the reset link → /auth/callback established a session, then
// redirected here to set a new password.
export default function ResetPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('minPassword'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordsNoMatch'));
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/account');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-heading text-4xl uppercase tracking-wide">{t('setNewTitle')}</h1>

      {error && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">{t('newPassword')}</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-ind"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">{t('confirmPassword')}</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input-ind"
        />
      </label>

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? t('updating') : t('updatePassword')}
      </button>
    </form>
  );
}
