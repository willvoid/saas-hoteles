import { describe, it, expect } from 'vitest';
import { formatGs } from './currency';

describe('formatGs', () => {
  it('groups thousands with a dot and prefixes Gs.', () => {
    expect(formatGs(150000)).toBe('Gs. 150.000');
    expect(formatGs(1000)).toBe('Gs. 1.000');
    expect(formatGs(0)).toBe('Gs. 0');
  });

  it('rounds to whole guaraníes (no decimals)', () => {
    expect(formatGs(1499.6)).toBe('Gs. 1.500');
    expect(formatGs(1499.4)).toBe('Gs. 1.499');
  });

  it('handles nullish and non-finite input as zero', () => {
    expect(formatGs(null)).toBe('Gs. 0');
    expect(formatGs(undefined)).toBe('Gs. 0');
    expect(formatGs(NaN)).toBe('Gs. 0');
  });
});
