'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getCalendar, type CalendarMonth } from '@/lib/api';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysBetweenInclusive(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000) + 1;
}

export default function AvailabilityCalendar({
  productId,
  maxRentalDays,
  onRangeChange,
}: {
  productId: string;
  maxRentalDays: number;
  onRangeChange?: (range: { start: string; end: string } | null) => void;
}) {
  const t = useTranslations('calendar');
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCalendar(productId, monthKey(view))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productId, view]);

  const dayMap = useMemo(() => {
    const m = new Map<string, { available: boolean; units_free: number }>();
    data?.days.forEach((d) => m.set(d.date, { available: d.available, units_free: d.units_free }));
    return m;
  }, [data]);

  const isPast = (s: string) => parse(s) < today;
  const inRange = (s: string) =>
    !!start && !!end && parse(s) >= parse(start) && parse(s) <= parse(end);

  const rangeAllAvailable = useCallback(
    (a: string, b: string) => {
      const start_ = parse(a);
      const end_ = parse(b);
      for (let d = new Date(start_); d <= end_; d.setDate(d.getDate() + 1)) {
        const info = dayMap.get(ymd(d));
        if (!info || !info.available) return false;
      }
      return true;
    },
    [dayMap],
  );

  function selectDay(s: string) {
    if (isPast(s)) return;
    const info = dayMap.get(s);
    if (!info || !info.available) return;

    if (!start || (start && end)) {
      setStart(s);
      setEnd(null);
      setNotice(t('a11yStart', { date: s }));
      onRangeChange?.(null);
      return;
    }
    // start set, choosing end
    if (parse(s) < parse(start)) {
      setStart(s);
      setNotice(t('a11yStartMoved', { date: s }));
      return;
    }
    const span = daysBetweenInclusive(start, s);
    if (span > maxRentalDays) {
      setNotice(t('a11yMax', { days: maxRentalDays }));
      return;
    }
    if (!rangeAllAvailable(start, s)) {
      setNotice(t('a11yUnavailable'));
      return;
    }
    setEnd(s);
    setNotice(t('a11yRange', { start, end: s, days: span }));
    onRangeChange?.({ start, end: s });
  }

  function clearSelection() {
    setStart(null);
    setEnd(null);
    setNotice(t('a11yCleared'));
    onRangeChange?.(null);
  }

  // Build the grid cells (leading blanks + days).
  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth =
    data?.days.length ?? new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(ymd(new Date(view.getFullYear(), view.getMonth(), d)));

  const dayCellIdx = cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);

  function onKeyDown(e: React.KeyboardEvent, cellIndex: number) {
    const pos = dayCellIdx.indexOf(cellIndex);
    let next = pos;
    if (e.key === 'ArrowRight') next = Math.min(pos + 1, dayCellIdx.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(pos - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(pos + 7, dayCellIdx.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(pos - 7, 0);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const s = cells[cellIndex];
      if (s) selectDay(s);
      return;
    } else return;
    e.preventDefault();
    const target = dayCellIdx[next];
    setFocusIdx(target);
    cellRefs.current[target]?.focus();
  }

  const monthLabel = view.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const canGoPrev = view > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div className="card-ind p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          className="btn-outline disabled:opacity-40"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          disabled={!canGoPrev}
          aria-label={t('prevMonth')}
        >
          ‹
        </button>
        <h3 className="font-heading text-3xl uppercase tracking-wide">{monthLabel}</h3>
        <button
          type="button"
          className="btn-outline"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          aria-label={t('nextMonth')}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[2px] mb-[2px]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center font-mono text-xs uppercase text-ind-steel py-1">
            {w}
          </div>
        ))}
      </div>

      {error ? (
        <p className="font-mono text-sm text-ind-danger p-4">{t('error')}</p>
      ) : loading ? (
        <p className="font-mono text-sm text-ind-steel p-4">{t('loading')}</p>
      ) : (
        <div role="grid" aria-label={`Availability for ${monthLabel}`} className="calendar-grid">
          {cells.map((s, i) => {
            if (!s) return <div key={`b${i}`} role="presentation" className="bg-ind-white" />;
            const info = dayMap.get(s);
            const past = isPast(s);
            const available = !!info?.available && !past;
            const cls = ['cal-day'];
            if (past) cls.push('past');
            else if (!info?.available) cls.push('booked');
            if (s === start || s === end) cls.push('selected-start');
            else if (inRange(s)) cls.push('in-range');
            const isFocusable = i === focusIdx || (focusIdx === 0 && i === dayCellIdx[0]);
            return (
              <div key={s} role="gridcell" className="contents">
                <button
                  type="button"
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  className={cls.join(' ')}
                  tabIndex={isFocusable ? 0 : -1}
                  disabled={!available && !(s === start || s === end || inRange(s))}
                  aria-disabled={past || !info?.available}
                  aria-label={`${s}, ${past ? t('dayPast') : info?.available ? t('dayAvailable', { n: info.units_free }) : t('dayBooked')}`}
                  aria-pressed={s === start || s === end || inRange(s)}
                  onClick={() => selectDay(s)}
                  onFocus={() => setFocusIdx(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  {Number(s.slice(-2))}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {notice}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <p className="font-mono text-sm">
          {start && end ? (
            t('selected', { start, end, days: daysBetweenInclusive(start, end) })
          ) : start ? (
            t('startThenEnd', { date: start })
          ) : (
            <span className="text-ind-steel">{t('selectPrompt')}</span>
          )}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            disabled
            title={t('phaseNote')}
          >
            {t('cta')}
          </button>
          {(start || end) && (
            <button type="button" className="btn-outline" onClick={clearSelection}>
              {t('clear')}
            </button>
          )}
        </div>
        <p className="font-mono text-[11px] text-ind-steel uppercase tracking-widest">
          {t('phaseNote')}
        </p>
      </div>
    </div>
  );
}
