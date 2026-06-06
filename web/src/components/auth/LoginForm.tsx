'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
      <h1 className="font-heading text-4xl uppercase tracking-wide">Operator Login</h1>
      <p className="font-mono text-sm text-ind-steel uppercase tracking-widest">
        &gt;&gt;&gt; Authenticate to access active jobs
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

      <label className="flex flex-col gap-1">
        <span className="font-heading uppercase tracking-wide">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-ind"
        />
      </label>

      <button type="submit" disabled={loading} className="btn-primary mt-2">
        {loading ? 'Authenticating…' : 'Log In'}
      </button>

      <div className="flex justify-between font-mono text-sm mt-2">
        <Link href="/forgot-password" className="underline hover:text-ind-danger">
          Forgot password?
        </Link>
        <Link href="/register" className="underline hover:text-ind-danger">
          Create account
        </Link>
      </div>
    </form>
  );
}
