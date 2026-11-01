// Plan morning-digest § 2d. Route tests for the digest page (§ 2a) and its JSON twin (§ 2b),
// through createApp().request(). Fixtures live in a temp runs dir; runs/ is never written.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const good = [
  '{"at":"2026-10-30T01:00:00+01:00","job":"b/job","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:05:00+01:00","job":"b/job","status":"ok","owner":"rook"}',
  '{"at":"2026-10-30T02:00:00+01:00","job":"c/render","status":"ok","owner":null}',
  '{"at":"2026-10-30T03:00:00+01:00","job":"a/sync","status":"fail","owner":"lane-07","error":"lock held"}',
];
const truncated = '{"at":"2026-10-30T05:00:00+01:00","job":"a/jo';

const GOOD_NIGHT = '2026-10-30';
const BAD_NIGHT = '2026-10-31';
const EMPTY_NIGHT = '2026-10-29';
const MISSING_NIGHT = '2026-10-25';

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, `${GOOD_NIGHT}.jsonl`), good.join('\n') + '\n');
  writeFileSync(join(runsDir, `${BAD_NIGHT}.jsonl`), [good[0], good[3], truncated].join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

// The table rows of a page: every <tr> that holds data cells (the header row has only <th>).
function dataRows(html: string): string[] {
  return html
    .split('<tr')
    .slice(1)
    .filter((seg) => seg.includes('<td'));
}

describe('GET /digest/:night (page)', () => {
  it('200 with one table row per job, sorted by job', async () => {
    const res = await app().request(`/digest/${GOOD_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const rows = dataRows(html);
    expect(rows).toHaveLength(3);
    const order = rows.map((seg) => ['a/sync', 'b/job', 'c/render'].find((j) => seg.includes(`>${j}<`)));
    expect(order).toEqual(['a/sync', 'b/job', 'c/render']);
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await app().request(`/digest/${GOOD_NIGHT}`)).text();
    const render = dataRows(html).find((seg) => seg.includes('>c/render<'));
    expect(render).toBeDefined();
    expect(render).toContain('—');
  });

  it('404 for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('200 and "nothing ran" for an empty night', async () => {
    const res = await app().request(`/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(dataRows(html)).toHaveLength(0);
  });

  it('200, the good jobs and "1 line in the log did not parse" for a bad line', async () => {
    const res = await app().request(`/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 line in the log did not parse');
    const rows = dataRows(html);
    expect(rows.some((seg) => seg.includes('>b/job<'))).toBe(true);
    expect(rows.some((seg) => seg.includes('>a/sync<'))).toBe(true);
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 with { night, rows, counts, badLines } and the row fields', async () => {
    const res = await app().request(`/api/digest/${GOOD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(GOOD_NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(body.rows).toHaveLength(3);
    for (const r of body.rows) {
      expect(Object.keys(r).sort()).toEqual(
        ['firstAt', 'job', 'lastAt', 'lastError', 'lastStatus', 'owner', 'retries', 'runs'].sort(),
      );
    }
    expect(body.rows.find((r) => r.job === 'b/job')).toMatchObject({
      owner: 'rook',
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-30T01:00:00+01:00',
      lastAt: '2026-10-30T01:05:00+01:00',
    });
    expect(body.rows.find((r) => r.job === 'c/render')).toMatchObject({ owner: null, lastError: null });
  });

  it('404 with a JSON error for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: unknown };
    expect(body.error).toBeDefined();
  });

  it('200 with rows: [] for an empty night', async () => {
    const res = await app().request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('200 with badLines: 1 and the good rows for a bad line', async () => {
    const res = await app().request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/sync', 'b/job']);
  });
});

describe('page and JSON agree', () => {
  it('job names in the page, in order, equal rows.map(job) from the JSON', async () => {
    const html = await (await app().request(`/digest/${GOOD_NIGHT}`)).text();
    const body = (await (await app().request(`/api/digest/${GOOD_NIGHT}`)).json()) as Night;
    const jobs = body.rows.map((r) => r.job);
    const pageJobs = dataRows(html).map((seg) => jobs.find((j) => seg.includes(`>${j}<`)));
    expect(jobs).toEqual(['a/sync', 'b/job', 'c/render']);
    expect(pageJobs).toEqual(jobs);
  });
});
