'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { emailFlowClient } from '@/lib/supabase/email-flow-client';
import { siteOrigin } from '@/lib/site';

export default function RegisterForm() {
  const t = useTranslations('auth');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('minPassword'));
      return;
    }
    setLoading(true);
    // Implicit-flow client so the confirmation email link returns the session in
    // the URL hash (no code_verifier) and works from any device.
    const supabase = emailFlowClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${siteOrigin()}/account`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-4xl uppercase tracking-wide">{t('checkEmailTitle')}</h1>
        <p className="font-mono text-sm">{t('checkEmailBody', { email })}</p>
        <Link href="/login" className="btn-outline self-start">
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-heading text-4xl uppercase tracking-wide">{t('registerTitle')}</h1>
      <p className="font-mono text-sm text-ind-steel uppercase tracking-widest">
        {t('registerSubtitle')}
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
        <span className="font-heading uppercase tracking-wide">{t('fullName')}</span>
        <input
          type="text"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="input-ind"
        />
      </label>

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

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">{t('password')}</span>
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

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? t('creating') : t('createAccount')}
      </button>

      <p className="font-mono text-sm mt-2">
        {t('alreadyRegistered')}{' '}
        <Link href="/login" className="underline hover:text-ind-danger">
          {t('logIn')}
        </Link>
      </p>
    </form>
  );
}
