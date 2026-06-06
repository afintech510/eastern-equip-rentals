'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterForm() {
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
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/account`,
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
        <h1 className="font-heading text-4xl uppercase tracking-wide">Check Your Email</h1>
        <p className="font-mono text-sm">
          We sent a confirmation link to <strong>{email}</strong>. Confirm it to activate your
          operator account.
        </p>
        <Link href="/login" className="btn-outline self-start">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="font-heading text-4xl uppercase tracking-wide">New Operator</h1>
      <p className="font-mono text-sm text-ind-steel uppercase tracking-widest">
        &gt;&gt;&gt; Register to reserve equipment
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
        <span className="font-heading uppercase tracking-wide">Full Name</span>
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

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">Password</span>
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
        {loading ? 'Creating…' : 'Create Account'}
      </button>

      <p className="font-mono text-sm mt-2">
        Already registered?{' '}
        <Link href="/login" className="underline hover:text-ind-danger">
          Log in
        </Link>
      </p>
    </form>
  );
}
