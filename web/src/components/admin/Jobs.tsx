'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

type Run = {
  status: string;
  started_at: string | null;
  finished_at: string | null;
  processed: number;
  skipped: number;
  error: string | null;
};
type JobRun = Run & { id: string; job_name: string; attempt: number; duration_ms: number | null };
type Dlq = {
  id: string;
  job_name: string;
  attempts: number;
  error: string | null;
  created_at: string;
};
type Summary = { jobs: Record<string, Run | null>; dead_letter_open: number };

const JOBS = ['hold_expiry', 'signwell_poll', 'retention_purge'] as const;

function statusClass(status: string | undefined) {
  if (status === 'succeeded') return 'text-green-700';
  if (status === 'failed' || status === 'dead_lettered') return 'text-ind-danger';
  return 'text-ind-steel';
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function Jobs() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [dlq, setDlq] = useState<Dlq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, r, d] = await Promise.all([
        adminFetch<Summary>('/jobs/summary'),
        adminFetch<JobRun[]>('/jobs/runs?limit=40'),
        adminFetch<Dlq[]>('/jobs/dead-letter'),
      ]);
      setSummary(s);
      setRuns(r);
      setDlq(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load job status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow(name: string) {
    setBusy(name);
    setErr(null);
    try {
      await adminFetch(`/jobs/${name}/run`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setBusy(null);
    }
  }

  async function resolve(id: string) {
    setBusy(id);
    try {
      await adminFetch(`/jobs/dead-letter/${id}/resolve`, { method: 'POST', body: '{}' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-5xl uppercase tracking-wide">Jobs</h1>
        <button className="btn-outline" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {err && <p className="font-mono text-sm text-ind-danger">{err}</p>}

      {summary && summary.dead_letter_open > 0 && (
        <div className="card-ind p-3 border-l-8 border-ind-danger">
          <p className="font-mono text-sm text-ind-danger">
            ⚠ {summary.dead_letter_open} dead-lettered job(s) need attention.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {JOBS.map((name) => {
          const last = summary?.jobs[name] ?? null;
          return (
            <div key={name} className="card-ind p-4">
              <h2 className="font-heading text-xl uppercase tracking-wide mb-2 border-b-4 border-ind-black pb-1">
                {name.replace(/_/g, ' ')}
              </h2>
              <p className={`font-mono text-sm ${statusClass(last?.status)}`}>
                {last ? last.status : 'never run'}
              </p>
              <p className="font-mono text-xs text-ind-steel mt-1">
                last: {fmt(last?.started_at ?? null)}
              </p>
              {last && (
                <p className="font-mono text-xs text-ind-steel">
                  processed {last.processed} · skipped {last.skipped}
                </p>
              )}
              <button
                className="btn-outline mt-3 w-full"
                onClick={() => void runNow(name)}
                disabled={busy === name}
              >
                {busy === name ? 'Running…' : 'Run now'}
              </button>
            </div>
          );
        })}
      </div>

      {dlq.length > 0 && (
        <div className="card-ind p-4 border-l-8 border-ind-danger">
          <h2 className="font-heading text-2xl uppercase tracking-wide mb-3">Dead-letter queue</h2>
          <ul className="flex flex-col gap-2">
            {dlq.map((j) => (
              <li
                key={j.id}
                className="font-mono text-sm flex flex-wrap justify-between gap-2 border-b-2 border-ind-black/10 pb-2"
              >
                <span>
                  <strong>{j.job_name}</strong> · {j.attempts} attempts · {fmt(j.created_at)}
                  <br />
                  <span className="text-ind-danger">{j.error}</span>
                </span>
                <button
                  className="btn-outline"
                  onClick={() => void resolve(j.id)}
                  disabled={busy === j.id}
                >
                  resolve
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-ind p-4">
        <h2 className="font-heading text-2xl uppercase tracking-wide mb-3 border-b-4 border-ind-black pb-1">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="font-mono text-sm text-ind-steel">No runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-left border-b-4 border-ind-black">
                  <th className="py-1 pr-3">job</th>
                  <th className="py-1 pr-3">status</th>
                  <th className="py-1 pr-3">attempt</th>
                  <th className="py-1 pr-3">started</th>
                  <th className="py-1 pr-3">dur (ms)</th>
                  <th className="py-1 pr-3">proc/skip</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b-2 border-ind-black/10">
                    <td className="py-1 pr-3">{r.job_name}</td>
                    <td className={`py-1 pr-3 ${statusClass(r.status)}`}>{r.status}</td>
                    <td className="py-1 pr-3">{r.attempt}</td>
                    <td className="py-1 pr-3">{fmt(r.started_at)}</td>
                    <td className="py-1 pr-3">{r.duration_ms ?? '—'}</td>
                    <td className="py-1 pr-3">
                      {r.processed}/{r.skipped}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
