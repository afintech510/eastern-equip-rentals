'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { authCallbackUrl } from '@/lib/site';

export default function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl('/reset-password'),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-4xl uppercase tracking-wide">{t('resetSentTitle')}</h1>
        <p className="font-mono text-sm">{t('resetSentBody', { email })}</p>
        <Link href="/login" className="btn-outline self-start">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-heading text-4xl uppercase tracking-wide">{t('resetTitle')}</h1>
      <p className="font-mono text-sm text-ind-steel uppercase tracking-widest">
        {t('resetSubtitle')}
      </p>

      {error && (
        <p
          role="alert"
          className="font-mono text-sm bg-ind-danger text-ind-white p-3 border-4 border-ind-black"
        >
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">{t('email')}</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-ind"
        />
      </label>

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? t('sending') : t('sendReset')}
      </button>

      <p className="font-mono text-sm mt-2">
        <Link href="/login" className="underline hover:text-ind-danger">
          {t('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
