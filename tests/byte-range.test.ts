import { describe, expect, it } from 'vitest';

import { parseByteRange } from '@/lib/domain/byte-range';

describe('parseByteRange', () => {
  const size = 1000;

  it('serves the whole object when there is no range', () => {
    expect(parseByteRange(null, size)).toBeNull();
    expect(parseByteRange('', size)).toBeNull();
    expect(parseByteRange('bytes=-', size)).toBeNull();
  });

  it('reads a closed range', () => {
    expect(parseByteRange('bytes=0-99', size)).toEqual({ start: 0, end: 99 });
  });

  it('reads an open-ended range to the last byte', () => {
    expect(parseByteRange('bytes=900-', size)).toEqual({ start: 900, end: 999 });
  });

  it('reads a suffix range, which is how PDF.js finds the cross-reference table', () => {
    expect(parseByteRange('bytes=-100', size)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', size)).toEqual({ start: 0, end: 999 });
  });

  it('clamps an end past the object to the last byte', () => {
    expect(parseByteRange('bytes=500-5000', size)).toEqual({ start: 500, end: 999 });
  });

  it('refuses a range that starts past the end', () => {
    expect(parseByteRange('bytes=1000-1200', size)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', size)).toBe('unsatisfiable');
  });

  it('ignores malformed and multi-range headers', () => {
    expect(parseByteRange('bytes=10-5', size)).toBeNull();
    expect(parseByteRange('items=0-10', size)).toBeNull();
    expect(parseByteRange('bytes=0-10,20-30', size)).toBeNull();
  });
});
