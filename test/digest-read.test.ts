import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.badLines).toBe(1);
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps retries, the last status and the last error per job', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const refresh = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(refresh.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh.lastAt).toBe('2026-10-29T01:37:00+01:00');
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
  });

  it('keeps a row whose owner is null', () => {
    const render = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render');
    expect(render).toMatchObject({ owner: null, runs: 1, lastError: null });
  });

  it('returns null for a night with no file, no rows for an empty one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-31')).toBeNull();
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts lines of the wrong shape as bad, and never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    const ok = '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"ok","owner":"x"}';
    writeFileSync(join(dir, '2026-10-30.jsonl'), [ok, '{"job":"a"}', '[]', '{"at":"x","job":"a","status":"ok","owner":null}', 'nope'].join('\r\n'));
    const n = readNight(dir, '2026-10-30')!;
    expect(n.badLines).toBe(4);
    expect(n.rows).toHaveLength(1);
  });

  it('refuses a night that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });
});
