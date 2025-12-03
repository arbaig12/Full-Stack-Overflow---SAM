import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCurrentDate, setCustomDate, getCurrentDateString } from '../utils/dateWrapper.js';

describe('Date Wrapper Utility', () => {
  beforeEach(() => {
    setCustomDate(null); // Reset to actual date
  });

  it('returns actual current date by default', () => {
    const date = getCurrentDate();
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBeCloseTo(Date.now(), -3); // Within 1 second
  });

  it('returns custom date when set', () => {
    setCustomDate('2025-09-15');
    const date = getCurrentDate();
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(8); // September is month 8 (0-indexed)
    expect(date.getDate()).toBe(15);
  });

  it('resets to actual date when set to null', () => {
    setCustomDate('2025-09-15');
    setCustomDate(null);
    const date = getCurrentDate();
    expect(date.getTime()).toBeCloseTo(Date.now(), -3);
  });

  it('returns formatted date string', () => {
    setCustomDate('2025-09-15');
    const dateString = getCurrentDateString();
    expect(dateString).toBe('2025-09-15');
  });

  it('handles date string parsing correctly', () => {
    setCustomDate('2025-12-25');
    const date = getCurrentDate();
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11); // December
    expect(date.getDate()).toBe(25);
  });
});

