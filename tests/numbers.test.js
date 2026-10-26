import { describe, expect, it } from 'vitest';
import {
  fmtClock,
  fmtDur,
  fmtNum,
  getNotationMode,
  parseNum,
  setNotationMode,
} from '../src/core/numbers.js';

describe('parseNum', () => {
  it('parses supported suffixes', () => {
    expect(parseNum('1.5K')).toBeCloseTo(1_500, 9);
    expect(parseNum('23.4M')).toBeCloseTo(23_400_000, 3);
    expect(parseNum('5.6B')).toBeCloseTo(5_600_000_000, 1);
    expect(parseNum('1.2T')).toBeCloseTo(1_200_000_000_000, 0);
    expect(parseNum('2Qa')).toBeCloseTo(2e15, 0);
  });

  it('is case-insensitive and strips thousands separators', () => {
    expect(parseNum('1.5k')).toBe(1_500);
    expect(parseNum('1,234')).toBe(1_234);
    expect(parseNum('23,400,000')).toBe(23_400_000);
    expect(parseNum(' 1.5 M ')).toBe(1_500_000);
  });

  it('accepts plain, decimal and scientific notation', () => {
    expect(parseNum('42')).toBe(42);
    expect(parseNum('0.25')).toBe(0.25);
    expect(parseNum('1e3')).toBe(1_000);
    expect(parseNum('1.5e2K')).toBe(150_000);
    expect(parseNum('-5')).toBe(-5);
  });

  it('accepts Chinese units', () => {
    expect(parseNum('1.23万')).toBeCloseTo(12_300, 9);
    expect(parseNum('1.23亿')).toBeCloseTo(123_000_000, 3);
    expect(parseNum('2.33兆')).toBeCloseTo(2.33e12, 0);
    expect(parseNum('1.00京')).toBeCloseTo(1e16, 0);
    expect(parseNum('1.00载')).toBeCloseTo(1e44, 0);
    expect(parseNum('1.5e3万')).toBe(15_000_000);
  });

  it('returns NaN for invalid input', () => {
    expect(parseNum('')).toBeNaN();
    expect(parseNum('   ')).toBeNaN();
    expect(parseNum('1.5X')).toBeNaN();
    expect(parseNum('abc')).toBeNaN();
    expect(parseNum(null)).toBeNaN();
    expect(parseNum(undefined)).toBeNaN();
    expect(parseNum('Infinity')).toBeNaN();
  });
});

describe('fmtNum', () => {
  it('formats small and large numbers', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(999)).toBe('999');
    expect(fmtNum(1234)).toBe('1.23K');
    expect(fmtNum(1.2e15)).toBe('1.20Qa');
    expect(fmtNum(1000)).toBe('1.00K');
  });

  it('keeps three significant digits with suffixes', () => {
    expect(fmtNum(2.33e12)).toBe('2.33T');
    expect(fmtNum(2.33e13)).toBe('23.3T');
    expect(fmtNum(2.33e14)).toBe('233T');
    expect(fmtNum(2.33e15)).toBe('2.33Qa');
    expect(fmtNum(1e45)).toBe('1.00e45');
  });

  it('supports Chinese units', () => {
    expect(fmtNum(12345, 'chinese')).toBe('1.23万');
    expect(fmtNum(123_456, 'chinese')).toBe('12.3万');
    expect(fmtNum(12_345_678, 'chinese')).toBe('1230万');
    expect(fmtNum(2.33e14, 'chinese')).toBe('233兆');
    expect(fmtNum(2.33e15, 'chinese')).toBe('2330兆');
    expect(fmtNum(2.33e16, 'chinese')).toBe('2.33京');
    expect(fmtNum(1e44, 'chinese')).toBe('1.00载');
    expect(fmtNum(1e48, 'chinese')).toBe('1.00e48');
    expect(fmtNum(1234, 'chinese')).toBe('1234');
  });

  it('supports scientific notation', () => {
    expect(fmtNum(12345, 'scientific')).toBe('1.23e4');
    expect(fmtNum(2.33e14, 'scientific')).toBe('2.33e14');
    expect(fmtNum(999_999, 'scientific')).toBe('1.00e6');
    expect(fmtNum(15, 'scientific')).toBe('15');
    expect(fmtNum(1e45, 'scientific')).toBe('1.00e45');
  });

  it('switches the global notation mode', () => {
    expect(getNotationMode()).toBe('short');
    expect(setNotationMode('chinese')).toBe('chinese');
    expect(fmtNum(12345)).toBe('1.23万');
    expect(setNotationMode('scientific')).toBe('scientific');
    expect(fmtNum(12345)).toBe('1.23e4');
    expect(setNotationMode('bogus')).toBe('short');
    expect(fmtNum(12345)).toBe('12.3K');
    setNotationMode('short');
  });

  it('rolls over to the next suffix when rounding reaches 1000', () => {
    expect(fmtNum(999.999)).toBe('1.00K');
    expect(fmtNum(999_999)).toBe('1.00M');
    expect(fmtNum(999_999_999)).toBe('1.00B');
  });

  it('handles negatives and non-finite values', () => {
    expect(fmtNum(-1234)).toBe('-1.23K');
    expect(fmtNum(Number.NaN)).toBe('∞');
    expect(fmtNum(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});

describe('fmtDur', () => {
  it('formats durations', () => {
    expect(fmtDur(0)).toBe('0秒');
    expect(fmtDur(-5)).toBe('0秒');
    expect(fmtDur(59)).toBe('59秒');
    expect(fmtDur(73)).toBe('1分13秒');
    expect(fmtDur(3661)).toBe('1时1分1秒');
  });

  it('handles non-finite values', () => {
    expect(fmtDur(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('fmtClock', () => {
  it('formats a clock time from a fixed now', () => {
    const now = new Date(2026, 9, 20, 12, 34, 0).getTime();
    expect(fmtClock(0, now)).toMatch(/^\d{2}:\d{2}$/);
    expect(fmtClock(60_000, now)).toMatch(/^\d{2}:\d{2}$/);
  });
});
