'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, type ThemeId } from '@/lib/themes';

// Dual-color interface selector — a wide rectangle that attaches flush beneath
// the language toggle (shared border, no top edge). Each swatch is a diagonal
// split of that theme's bright primary over industrial black. Selection sets
// data-theme on <html>, which re-points the --ind-yellow CSS variable so every
// ind-yellow utility, the hazard stripes, gear, and scrollbar recolor at once.
// Persisted to localStorage; applied pre-hydration by the init script in layout.
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  // Sync state with whatever the pre-hydration script already applied.
  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme') as ThemeId | null;
    if (stored && THEMES.some((t) => t.id === stored)) setTheme(stored);
  }, []);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute('data-theme', id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* storage may be blocked; theme still applies for the session */
    }
  }

  return (
    <div
      className="flex w-full border-2 border-t-0 border-ind-yellow"
      role="group"
      aria-label="Interface color theme"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => choose(t.id)}
          aria-pressed={theme === t.id}
          aria-label={`${t.label} and black`}
          title={`${t.label} & Black`}
          className={`relative h-6 flex-1 transition-all ${
            theme === t.id
              ? 'z-10 ring-2 ring-inset ring-ind-white'
              : 'opacity-70 hover:opacity-100'
          }`}
          style={{ background: `linear-gradient(135deg, ${t.primary} 0 50%, #111111 50% 100%)` }}
        />
      ))}
    </div>
  );
}
