'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordForm() {
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
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
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
        <h1 className="font-heading text-4xl uppercase tracking-wide">Reset Sent</h1>
        <p className="font-mono text-sm">
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
        </p>
        <Link href="/login" className="btn-outline self-start">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-heading text-4xl uppercase tracking-wide">Reset Password</h1>
      <p className="font-mono text-sm text-ind-steel uppercase tracking-widest">
        &gt;&gt;&gt; We&apos;ll send a reset link
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
        <span className="font-heading uppercase tracking-wide">Email</span>
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
        {loading ? 'Sending…' : 'Send Reset Link'}
      </button>

      <p className="font-mono text-sm mt-2">
        <Link href="/login" className="underline hover:text-ind-danger">
          Back to login
        </Link>
      </p>
    </form>
  );
}
