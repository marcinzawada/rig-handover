// Plan morning-digest § 1. The contract every part of § 2 starts against: the page, the JSON,
// the board link and the route tests all read a Night, never the log itself.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once it has parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide). `owner` stays null here;
// views render it as `—`. `lastError` is the job's latest error line, null if it never had one.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A night on disk. `rows` are sorted by job. `counts` are parsed lines per status (the board shows
// them beside each night). `badLines` counts lines that didn't parse: they are counted, never
// thrown, so the night still renders.
export type Night = {
  night: string;
  rows: DigestRow[];
  counts: Record<RunStatus, number>;
  badLines: number;
};

// Reads runs/<night>.jsonl from `runsDir`. Returns null when the night has no file (routes
// answer 404); an empty file gives a Night with no rows ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
