import { describe, it, expect } from 'vitest';
import { COLORS, HEX, TINT_CHANNELS, tint, type ColorName, type TintName } from './colors';

// Vitest stubs .css imports (even with ?raw), so read the file from disk. The module name is built at
// runtime because @types/node is not installed and a literal 'node:fs' would fail type-checking.
const fs = await import(/* @vite-ignore */ ['node', 'fs'].join(':'));
const indexCss: string = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/** Declarations inside the first :root block of index.css, as { '--name': 'value' }. */
function readRootVars(): Record<string, string> {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(indexCss);
  if (!block) throw new Error(':root block not found in index.css');
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Expands 3-digit hex shorthand to its 6-digit form. */
const expandHex = (hex: string) =>
  /^#[0-9a-f]{3}$/i.test(hex) ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;

const hexToTriplet = (hex: string) => {
  const h = expandHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

const cssVarOf = (ref: string) => /^var\((--[\w-]+)\)$/.exec(ref)![1];

describe('color constants', () => {
  const rootVars = readRootVars();

  it('every COLORS entry references a variable declared in index.css', () => {
    for (const [name, ref] of Object.entries(COLORS)) {
      expect(rootVars, `COLORS.${name} -> ${ref}`).toHaveProperty(cssVarOf(ref));
    }
  });

  it('HEX mirrors the value of the matching CSS variable', () => {
    for (const name of Object.keys(COLORS) as ColorName[]) {
      const cssValue = rootVars[cssVarOf(COLORS[name])];
      expect(normalize(expandHex(HEX[name])), `HEX.${name}`).toBe(normalize(expandHex(cssValue)));
    }
  });

  it('every tint channel variable is declared and matches the RGB of its base color', () => {
    for (const name of Object.keys(TINT_CHANNELS) as TintName[]) {
      const channel = rootVars[TINT_CHANNELS[name]];
      expect(channel, `${TINT_CHANNELS[name]} declared`).toBeDefined();
      expect(channel, `${TINT_CHANNELS[name]} vs HEX.${name}`).toBe(hexToTriplet(HEX[name]));
    }
  });

  it('tint builds a CSS rgb() string using the channel variable', () => {
    expect(tint('success', 0.15)).toBe('rgb(var(--success-rgb) / 0.15)');
    expect(tint('black', 0.5)).toBe('rgb(var(--black-rgb) / 0.5)');
  });
});
