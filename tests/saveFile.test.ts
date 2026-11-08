import { describe, expect, it } from 'vitest';
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  buildSaveText,
  parseSaveText,
  saveFileName,
} from '../src/data/saveFile.ts';

const NOW = Date.parse('2026-11-09T05:07:00+08:00');

function rawStore() {
  return {
    globalGrowth: '1.15',
    asOf: NOW,
    resources: [{ id: 'r1', emoji: '🔥', name: '基因', amount: '100', baseRate: '0' }],
    factories: [
      {
        id: 'f1',
        name: '粮库',
        price: '10',
        unit: '1',
        growth: '1.15',
        owned: '1',
        outputResourceId: 'r1',
        costResourceId: 'r1',
      },
    ],
    upgrades: [],
    completedUpgrades: [],
    plan: null,
    reminder: null,
    preset: null,
  };
}

describe('save files', () => {
  it('builds a versioned archive around the current store', () => {
    const payload = JSON.parse(buildSaveText(rawStore(), NOW));
    expect(payload.format).toBe(SAVE_FORMAT);
    expect(payload.version).toBe(SAVE_VERSION);
    expect(payload.exportedAt).toBe('2026-11-08T21:07:00.000Z');
    expect(payload.data.factories[0].name).toBe('粮库');
    expect(payload.data.resources[0].emoji).toBe('🔥');
  });

  it('accepts both wrapped and raw store files', () => {
    const wrapped = buildSaveText(rawStore(), NOW);
    expect(parseSaveText(wrapped, NOW).factories[0].name).toBe('粮库');

    const raw = parseSaveText(JSON.stringify(rawStore()), NOW);
    expect(raw.resources).toHaveLength(1);
    expect(raw.factories[0].name).toBe('粮库');
  });

  it('rejects invalid JSON, unrelated JSON, and newer versions', () => {
    expect(() => parseSaveText('not json')).toThrow('合法');
    expect(() => parseSaveText(JSON.stringify({ hello: 'world' }))).toThrow('resources');
    expect(() =>
      parseSaveText(JSON.stringify({ data: { resources: [] } })),
    ).toThrow('resources');
    expect(() =>
      parseSaveText(
        JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION + 1, data: rawStore() }),
      ),
    ).toThrow('比当前版本');
  });

  it('normalizes missing references in imported data', () => {
    const raw = rawStore();
    raw.factories[0].outputResourceId = 'missing';
    raw.factories[0].costResourceId = 'missing';
    const store = parseSaveText(JSON.stringify(raw), NOW);
    expect(store.factories[0].outputResourceId).toBe('r1');
    expect(store.factories[0].costResourceId).toBe('r1');
  });

  it('names files with the local export time', () => {
    expect(saveFileName(NOW)).toMatch(/^探索助手存档-\d{8}-\d{4}\.json$/);
  });
});
