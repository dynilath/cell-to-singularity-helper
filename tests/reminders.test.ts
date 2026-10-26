import { describe, expect, it } from 'vitest';
import {
  HALF_THRESHOLD_MS,
  isDue,
  isRunning,
  makeReminder,
  markFired,
  pauseReminder,
  reminderEndTime,
  resumeReminder,
  retimeReminder,
} from '../src/services/reminders.ts';

const NOW = 1_800_000_000_000;

function make(overrides = {}) {
  return makeReminder({
    title: '该买工厂1·第1台了！',
    body: '价格 100',
    endTime: NOW + 60_000,
    now: NOW,
    ...overrides,
  });
}

describe('reminder model', () => {
  it('creates a running reminder with the full duration', () => {
    const reminder = make();
    expect(reminder).toMatchObject({
      kind: 'full',
      title: '该买工厂1·第1台了！',
      body: '价格 100',
      endTime: NOW + 60_000,
      durMs: 60_000,
      fired: false,
      paused: false,
    });
    expect(isRunning(reminder)).toBe(true);
    expect(isDue(reminder, NOW + 59_999)).toBe(false);
    expect(isDue(reminder, NOW + 60_000)).toBe(true);
  });

  it('pauses and resumes without losing the remaining time', () => {
    const paused = pauseReminder(make(), NOW + 15_000);
    expect(paused.paused).toBe(true);
    expect(paused.remainMs).toBe(45_000);
    expect(isDue(paused, NOW + 10 ** 9)).toBe(false);

    const resumed = resumeReminder(paused, NOW + 100_000);
    expect(resumed.paused).toBe(false);
    expect(resumed.endTime).toBe(NOW + 145_000);
    expect('remainMs' in resumed).toBe(false);
  });

  it('retimes from now and clears fired/paused state', () => {
    const fired = markFired(make());
    expect(fired.fired).toBe(true);
    expect(isRunning(fired)).toBe(false);

    const retimed = retimeReminder(fired, NOW + 500_000);
    expect(retimed.fired).toBe(false);
    expect(retimed.paused).toBe(false);
    expect(retimed.endTime).toBe(NOW + 560_000);
  });

  it('keeps a short reminder on the full duration even when half is enabled', () => {
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 299,
      halfEnabled: true,
      now: NOW,
    });
    expect(timing.half).toBe(false);
    expect(timing.endTime).toBe(NOW + 299_000);
  });

  it('uses the explicit offline block midpoint for the ad reminder', () => {
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 600,
      halfEnabled: true,
      now: NOW,
      halfAtSeconds: 300,
    });
    expect(timing.half).toBe(true);
    expect(timing.endTime).toBe(NOW + 300_000);
  });

  it('uses the midpoint from the 5-minute boundary', () => {
    expect(HALF_THRESHOLD_MS).toBe(5 * 60 * 1000);

    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 300,
      halfEnabled: true,
      now: NOW,
    });
    expect(timing.half).toBe(true);
    expect(timing.endTime).toBe(NOW + 150_000);
  });

  it('sets a long reminder at the midpoint when half is enabled', () => {
    const stepSeconds = 3600;
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds,
      halfEnabled: true,
      now: NOW,
    });
    expect(timing.half).toBe(true);
    expect(timing.endTime).toBe(NOW + stepSeconds * 500);
    expect(timing.endTime - NOW).toBeGreaterThanOrEqual(HALF_THRESHOLD_MS);
  });

  it('respects the half checkbox', () => {
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 3600,
      halfEnabled: false,
      now: NOW,
    });
    expect(timing.half).toBe(false);
    expect(timing.endTime).toBe(NOW + 3_600_000);
  });

  it('shortens only the reminder wait by the offline rate', () => {
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 3600,
      halfEnabled: false,
      now: NOW,
      offlineRate: 2.1,
    });
    expect(timing.half).toBe(false);
    expect(timing.endTime).toBeCloseTo(NOW + 3_600_000 / 2.1, 6);
  });

  it('applies the 5-minute half threshold to the offline-adjusted wait', () => {
    const timing = reminderEndTime({
      anchor: NOW,
      stepSeconds: 600,
      halfEnabled: true,
      now: NOW,
      offlineRate: 3,
    });
    expect(timing.half).toBe(false);
    expect(timing.endTime).toBeCloseTo(NOW + 200_000, 6);

    const half = reminderEndTime({
      anchor: NOW,
      stepSeconds: 1200,
      halfEnabled: true,
      now: NOW,
      offlineRate: 2,
    });
    expect(half.half).toBe(true);
    expect(half.endTime).toBeCloseTo(NOW + 300_000, 6);
  });
});
