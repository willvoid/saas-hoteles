/**
 * Color constants.
 *
 * The CSS custom properties declared in `src/index.css` (:root) are the single
 * source of truth. Everything here points to them (COLORS, tint) or mirrors
 * them for the few places that cannot consume a CSS variable (HEX).
 * `colors.test.ts` fails if the two sides drift apart.
 */

/** Solid colors as `var(--...)` references. Use these in inline styles and component props. */
export const COLORS = {
  primary: 'var(--primary-color)',
  primaryHover: 'var(--primary-hover)',
  primaryLight: 'var(--primary-light)',
  bgStart: 'var(--bg-gradient-start)',
  bgEnd: 'var(--bg-gradient-end)',
  glassBg: 'var(--glass-bg)',
  glassBorder: 'var(--glass-border)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  error: 'var(--error-color)',
  errorLight: 'var(--error-light)',
  errorLighter: 'var(--error-lighter)',
  success: 'var(--success-color)',
  successLight: 'var(--success-light)',
  successLighter: 'var(--success-lighter)',
  successDark: 'var(--success-dark)',
  warning: 'var(--warning-color)',
  warningLight: 'var(--warning-light)',
  purple: 'var(--purple-color)',
  purpleLight: 'var(--purple-light)',
  purpleLighter: 'var(--purple-lighter)',
  indigo: 'var(--indigo-color)',
  orange: 'var(--orange-color)',
  orangeLight: 'var(--orange-light)',
  white: 'var(--white)',
  black: 'var(--black)',
} as const;

export type ColorName = keyof typeof COLORS;

/** RGB-channel variables (`--x-rgb`) that can be combined with an alpha value via `tint`. */
export const TINT_CHANNELS = {
  primary: '--primary-rgb',
  primaryHover: '--primary-hover-rgb',
  primaryLight: '--primary-light-rgb',
  bgStart: '--bg-gradient-start-rgb',
  bgEnd: '--bg-gradient-end-rgb',
  textSecondary: '--text-secondary-rgb',
  error: '--error-rgb',
  success: '--success-rgb',
  warning: '--warning-rgb',
  purple: '--purple-rgb',
  orange: '--orange-rgb',
  white: '--white-rgb',
  black: '--black-rgb',
} as const;

export type TintName = keyof typeof TINT_CHANNELS;

/**
 * Translucent variant of a palette color, e.g. `tint('success', 0.15)`.
 * Returns a CSS `rgb(r g b / alpha)` string, so it is valid anywhere a CSS color is.
 * Never append alpha to a COLORS value (`${COLORS.success}20` is invalid CSS): use this instead.
 */
export const tint = (name: TintName, alpha: number): string =>
  `rgb(var(${TINT_CHANNELS[name]}) / ${alpha})`;

/**
 * Raw literals, ONLY for contexts that cannot resolve `var(--...)`:
 * jsPDF, canvas / html2canvas, `<input type="color">`, SVG data URIs, or code that
 * builds colors by string concatenation (`color + '20'`).
 * Values must stay identical to the variables in `src/index.css` (:root).
 */
export const HEX = {
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryLight: '#60a5fa',
  bgStart: '#0f172a',
  bgEnd: '#1e293b',
  glassBg: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  error: '#ef4444',
  errorLight: '#f87171',
  errorLighter: '#fca5a5',
  success: '#10b981',
  successLight: '#34d399',
  successLighter: '#6ee7b7',
  successDark: '#059669',
  warning: '#f59e0b',
  warningLight: '#fbbf24',
  purple: '#8b5cf6',
  purpleLight: '#a78bfa',
  purpleLighter: '#c084fc',
  indigo: '#6366f1',
  orange: '#f97316',
  orangeLight: '#fb923c',
  white: '#ffffff',
  black: '#000000',
} as const satisfies Record<ColorName, string>;
