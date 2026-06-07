'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  getMe,
  getMyRentals,
  registerLicense,
  updateMe,
  type MeProfile,
  type MyRental,
} from '@/lib/api';

export default function AccountClient() {
  const t = useTranslations('account');
  const [me, setMe] = useState<MeProfile | null>(null);
  const [rentals, setRentals] = useState<MyRental[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [licMsg, setLicMsg] = useState('');
  const [uploading, setUploading] = useState(false);

  const token = useCallback(async () => {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? '';
  }, []);

  const load = useCallback(async () => {
    const tk = await token();
    if (!tk) return;
    const [m, r] = await Promise.all([getMe(tk), getMyRentals(tk)]);
    setMe(m);
    setFullName(m.full_name ?? '');
    setPhone(m.phone ?? '');
    setRentals(r);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavedMsg('');
    const tk = await token();
    await updateMe(tk, { full_name: fullName, phone });
    setSavedMsg(t('saved'));
    void load();
  }

  async function onLicenseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !me) return;
    setLicMsg('');
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('licenses').upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      const tk = await token();
      await registerLicense(tk, path);
      await load();
    } catch (err) {
      setLicMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const licLabel: Record<string, string> = {
    none: t('licNone'),
    pending: t('licPending'),
    approved: t('licApproved'),
    rejected: t('licRejected'),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Profile */}
      <form onSubmit={saveProfile} className="card-ind p-6 flex flex-col gap-3">
        <div className="h-2 w-full hazard-stripes -mt-6 -mx-6 mb-2" aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase tracking-wide">{t('profile')}</h2>
        <p className="font-mono text-xs text-ind-steel">{me?.email}</p>
        <label className="flex flex-col gap-1">
          <span className="font-heading uppercase tracking-wide">{t('fullName')}</span>
          <input
            className="input-ind"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-heading uppercase tracking-wide">{t('phone')}</span>
          <input className="input-ind" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary">
            {t('save')}
          </button>
          {savedMsg && <span className="font-mono text-sm text-ind-steel">{savedMsg}</span>}
        </div>
      </form>

      {/* License */}
      <div className="card-ind p-6 flex flex-col gap-3">
        <h2 className="font-heading text-3xl uppercase tracking-wide">{t('license')}</h2>
        <p className="font-mono text-sm">
          {t('licenseStatus')}:{' '}
          <strong
            className={
              me?.license_status === 'approved'
                ? 'text-ind-black'
                : me?.license_status === 'rejected'
                  ? 'text-ind-danger'
                  : 'text-ind-steel'
            }
          >
            {me ? licLabel[me.license_status] : ''}
          </strong>
        </p>
        {me?.license_status !== 'approved' && (
          <>
            <p className="font-mono text-xs text-ind-steel">{t('licHint')}</p>
            <label className="btn-outline self-start cursor-pointer">
              {uploading ? t('licUploading') : t('licUpload')}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onLicenseFile}
                disabled={uploading}
              />
            </label>
          </>
        )}
        {licMsg && <p className="font-mono text-sm text-ind-danger">{licMsg}</p>}
      </div>

      {/* Rentals */}
      <div className="card-ind p-6">
        <h2 className="font-heading text-3xl uppercase tracking-wide mb-4">{t('myRentals')}</h2>
        {rentals.length === 0 ? (
          <p className="font-mono text-sm text-ind-steel">{t('noRentals')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rentals.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ind-black/10 pb-3 font-mono text-sm"
              >
                <span>
                  <strong>{r.product_name}</strong> · {r.start_date} → {r.end_date}
                </span>
                <span className="flex items-center gap-3">
                  <span className="uppercase text-ind-steel">{r.status}</span>
                  <Link href={`/reserve/confirmation/${r.id}`} className="btn-outline">
                    {t('viewRental')}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
