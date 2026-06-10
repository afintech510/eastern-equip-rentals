// Interface color themes (§4.5 primary swap). Each theme is a "dual color":
// a bright primary paired with the constant industrial black/greys. Only the
// --ind-yellow primary token swaps at runtime; black, concrete, and steel are
// shared across all themes. Swatch hex values must match the RGB channels
// declared for each [data-theme] in globals.css.
export type ThemeId = 'yellow' | 'lime' | 'orange' | 'pink';

export const DEFAULT_THEME: ThemeId = 'yellow';

export const THEME_STORAGE_KEY = 'er-theme';

export const THEMES: { id: ThemeId; label: string; primary: string }[] = [
  { id: 'yellow', label: 'Safety Yellow', primary: '#FFCC00' },
  { id: 'lime', label: 'Lime Green', primary: '#A3E635' },
  { id: 'orange', label: 'Construction Orange', primary: '#F97316' },
  { id: 'pink', label: 'Hot Pink', primary: '#EC4899' },
];
