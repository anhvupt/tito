import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  AdminError,
  defaultGitRunner,
  isSecretFilename,
  loadRepos,
  type GitRunner,
} from "./admin.js";
import { parseConfig } from "./config.js";
import { readFeedbackOutcome } from "./feedback.js";
import { RISK_PROFILES, type ActiveRiskProfileId } from "./profiles.js";

export const PREFIX_RULE_MARKER = "A commit subject is `<type>: <sentence>`.";

const WEEK_ID = /^(\d{4})-W(\d{2})$/;
const TYPE_PREFIX = /^(feat|fix|hot-fix|chores|refactor|debug): /;
const MERGE_PULL_REQUEST = /^Merge pull request #\d+/;
const MERGE_BRANCH = /^Merge branch(?:\s|$)/;
const REVIEW_PATH = /^\.tito\/feedback\/[a-z0-9]+(?:-[a-z0-9]+)*\/review\.md$/;
const QUIET_SUMMARY = "No Tito activity this week.";

export type RetroOutcomes = {
  readonly accepted: number;
  readonly edited: number;
  readonly expanded: number;
  readonly unknown: number;
};

export type RetroRepo = {
  readonly path: string;
  readonly missing?: true;
};

export type RetroReport = {
  readonly week: string;
  readonly timezone: string;
  readonly source: "local";
  readonly summary: string;
  readonly alerts: readonly [];
  readonly outcomes: RetroOutcomes;
  readonly prefixMisses: number;
  readonly sliceOverLimit: number;
  readonly merged: number;
  readonly reviewFixes: "unavailable";
  readonly docsBlank: "unavailable";
  readonly mergeDuration: "unavailable";
  readonly repos: readonly RetroRepo[];
};

export type WeekRange = {
  readonly start: Date;
  readonly end: Date;
};

export type DatedSubject = {
  readonly subject: string;
  readonly date: string;
};

type RetroCommit = DatedSubject & {
  readonly hash: string;
  readonly files: readonly string[];
};

export type RetroErrorCode = "invalid-week" | "invalid-timezone";

export class RetroError extends Error {
  readonly code: RetroErrorCode;

  constructor(code: RetroErrorCode, message: string) {
    super(message);
    this.name = "RetroError";
    this.code = code;
  }
}

export type BuildRetroOptions = {
  readonly adminRoot: string;
  readonly week?: string;
  readonly timezone?: string;
  readonly git?: GitRunner;
  readonly now?: Date;
};

type CivilDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

export function machineTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function weeksInIsoYear(year: number): number {
  const januaryFirst = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (januaryFirst === 4 || (leap && januaryFirst === 3)) return 53;
  return 52;
}

export function parseWeekId(value: string): { readonly year: number; readonly week: number } | null {
  const match = WEEK_ID.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week)) return null;
  if (week < 1 || week > weeksInIsoYear(year)) return null;
  return { year, week };
}

function formatWeekId(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function partValue(parts: readonly Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string | null {
  return parts.find((part) => part.type === type)?.value ?? null;
}

function civilDate(instant: Date, timeZone: string): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  if (year === null || month === null || day === null) {
    throw new RetroError("invalid-timezone", `Timezone "${timeZone}" is not an IANA name.`);
  }
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function isoWeekOfCivil(civil: CivilDate): { readonly year: number; readonly week: number } {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const dayIndex = Math.round((date.getTime() - yearStart.getTime()) / 86400000);
  const week = Math.ceil((dayIndex + 1) / 7);
  return { year, week };
}

export function isoWeekId(instant: Date, timeZone: string): string {
  if (!isIanaTimeZone(timeZone)) {
    throw new RetroError("invalid-timezone", `Timezone "${timeZone}" is not an IANA name.`);
  }
  const week = isoWeekOfCivil(civilDate(instant, timeZone));
  return formatWeekId(week.year, week.week);
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  const minute = partValue(parts, "minute");
  const second = partValue(parts, "second");
  let hour = partValue(parts, "hour");
  if (year === null || month === null || day === null || hour === null || minute === null || second === null) {
    throw new RetroError("invalid-timezone", `Timezone "${timeZone}" is not an IANA name.`);
  }
  if (hour === "24") hour = "00";
  const asUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return asUtc - instant.getTime();
}

function zonedMidnightUtc(civil: CivilDate, timeZone: string): Date {
  const guess = Date.UTC(civil.year, civil.month - 1, civil.day, 0, 0, 0, 0);
  const first = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  const second = guess - timeZoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

function addDays(civil: CivilDate, days: number): CivilDate {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isoWeekMonday(year: number, week: number): CivilDate {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - (weekday - 1) + (week - 1) * 7);
  return {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  };
}

export function weekRange(weekId: string, timeZone: string): WeekRange {
  const parsed = parseWeekId(weekId);
  if (parsed === null) {
    throw new RetroError("invalid-week", `Week "${weekId}" is not an ISO week (YYYY-Www).`);
  }
  if (!isIanaTimeZone(timeZone)) {
    throw new RetroError("invalid-timezone", `Timezone "${timeZone}" is not an IANA name.`);
  }
  const monday = isoWeekMonday(parsed.year, parsed.week);
  return {
    start: zonedMidnightUtc(monday, timeZone),
    end: zonedMidnightUtc(addDays(monday, 7), timeZone),
  };
}

function isMergeSubject(subject: string): boolean {
  return MERGE_PULL_REQUEST.test(subject) || MERGE_BRANCH.test(subject);
}

export function countPrefixMisses(
  commits: readonly DatedSubject[],
  ruleLandedAt: string | null,
  range: WeekRange,
): number {
  if (ruleLandedAt === null) return 0;
  const landed = Date.parse(ruleLandedAt);
  if (Number.isNaN(landed)) return 0;
  const start = range.start.getTime();
  const end = range.end.getTime();
  let count = 0;
  for (const commit of commits) {
    const at = Date.parse(commit.date);
    if (Number.isNaN(at) || at < start || at >= end || at < landed) continue;
    if (isMergeSubject(commit.subject) || TYPE_PREFIX.test(commit.subject)) continue;
    count += 1;
  }
  return count;
}

export function countReviewOutcomes(texts: readonly string[]): RetroOutcomes {
  const outcomes: { accepted: number; edited: number; expanded: number; unknown: number } = {
    accepted: 0,
    edited: 0,
    expanded: 0,
    unknown: 0,
  };
  for (const text of texts) {
    outcomes[readFeedbackOutcome(text)] += 1;
  }
  return outcomes;
}

function emptyOutcomes(): { accepted: number; edited: number; expanded: number; unknown: number } {
  return { accepted: 0, edited: 0, expanded: 0, unknown: 0 };
}

function authoredFileLimit(profile: ActiveRiskProfileId): number | null {
  const value = RISK_PROFILES[profile];
  return "maxAuthoredFiles" in value ? value.maxAuthoredFiles : null;
}

function sliceFileLimit(repoPath: string): number | null {
  const configPath = join(repoPath, "tito.yaml");
  if (!existsSync(configPath)) return null;
  try {
    return authoredFileLimit(parseConfig(readFileSync(configPath, "utf8")).profile);
  } catch {
    return null;
  }
}

function countSliceOverLimit(commits: readonly RetroCommit[], limit: number | null): number {
  if (limit === null) return 0;
  let count = 0;
  for (const commit of commits) {
    if (commit.files.length > limit) count += 1;
  }
  return count;
}

function countMerged(commits: readonly DatedSubject[]): number {
  let count = 0;
  for (const commit of commits) {
    if (MERGE_PULL_REQUEST.test(commit.subject)) count += 1;
  }
  return count;
}

function summarize(
  commitCount: number,
  prefixMisses: number,
  sliceOverLimit: number,
  merged: number,
  outcomes: RetroOutcomes,
): string {
  if (commitCount === 0) return QUIET_SUMMARY;
  const noun = commitCount === 1 ? "commit" : "commits";
  return `${commitCount} ${noun}; prefix misses ${prefixMisses}; slice over limit ${sliceOverLimit}; merged ${merged}; outcomes ${outcomes.accepted} accepted, ${outcomes.edited} edited, ${outcomes.expanded} expanded, ${outcomes.unknown} unknown.`;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function tryGit(git: GitRunner, cwd: string, args: readonly string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function gitInstant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseRetroLog(stdout: string): RetroCommit[] {
  const commits: RetroCommit[] = [];
  for (const block of stdout.split(/\n(?=◆)/)) {
    const trimmed = block.trim();
    if (!trimmed.startsWith("◆")) continue;
    const lines = trimmed.split("\n");
    const header = lines[0];
    if (header === undefined || !header.startsWith("◆")) continue;
    const parts = header.slice(1).split("\0");
    const hash = parts[0] ?? "";
    const subject = parts[1] ?? "";
    const date = parts[2] ?? "";
    if (hash.length === 0) continue;
    const files: string[] = [];
    for (const line of lines.slice(1)) {
      const file = line.trim();
      if (file.length === 0 || isSecretFilename(file)) continue;
      files.push(file);
    }
    commits.push({ hash, subject, date, files });
  }
  return commits;
}

function inRange(date: string, range: WeekRange): boolean {
  const at = Date.parse(date);
  return !Number.isNaN(at) && at >= range.start.getTime() && at < range.end.getTime();
}

function readWeekCommits(git: GitRunner, repoPath: string, range: WeekRange): RetroCommit[] {
  const since = gitInstant(new Date(range.start.getTime() - 1000));
  const log = git(repoPath, [
    "log",
    `--since=${since}`,
    `--until=${gitInstant(range.end)}`,
    "--pretty=format:◆%H%x00%s%x00%cI",
    "--name-only",
  ]);
  return parseRetroLog(log).filter((commit) => inRange(commit.date, range));
}

function ruleLandedAt(git: GitRunner, repoPath: string): string | null {
  const log = git(repoPath, [
    "log",
    "--reverse",
    "--pretty=format:%H%x00%cI",
    "--",
    "AGENTS.md",
  ]);
  for (const line of log.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const [hash, date] = trimmed.split("\0");
    if (hash === undefined || date === undefined || hash.length === 0 || date.length === 0) continue;
    const text = tryGit(git, repoPath, ["show", `${hash}:AGENTS.md`]);
    if (text !== null && text.includes(PREFIX_RULE_MARKER)) return date;
  }
  return null;
}

function reviewTexts(git: GitRunner, repoPath: string, commits: readonly RetroCommit[]): string[] {
  const hashesByPath = new Map<string, string[]>();
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!REVIEW_PATH.test(file)) continue;
      const hashes = hashesByPath.get(file);
      if (hashes === undefined) hashesByPath.set(file, [commit.hash]);
      else hashes.push(commit.hash);
    }
  }
  const texts: string[] = [];
  for (const [file, hashes] of hashesByPath) {
    for (const hash of hashes) {
      const text = tryGit(git, repoPath, ["show", `${hash}:${file}`]);
      if (text === null) continue;
      texts.push(text);
      break;
    }
  }
  return texts;
}

export function buildRetro(options: BuildRetroOptions): RetroReport {
  const timezone = options.timezone ?? machineTimeZone();
  if (!isIanaTimeZone(timezone)) {
    throw new RetroError("invalid-timezone", `Timezone "${timezone}" is not an IANA name.`);
  }
  const week = options.week ?? isoWeekId(options.now ?? new Date(), timezone);
  if (parseWeekId(week) === null) {
    throw new RetroError("invalid-week", `Week "${week}" is not an ISO week (YYYY-Www).`);
  }
  const range = weekRange(week, timezone);
  const git = options.git ?? defaultGitRunner;
  const outcomes = emptyOutcomes();
  const repos: RetroRepo[] = [];
  let prefixMisses = 0;
  let sliceOverLimit = 0;
  let merged = 0;
  let commitCount = 0;

  for (const repo of loadRepos(options.adminRoot)) {
    if (!isDirectory(repo.path)) {
      repos.push({ path: repo.path, missing: true });
      continue;
    }
    repos.push({ path: repo.path });
    const commits = readWeekCommits(git, repo.path, range);
    commitCount += commits.length;
    prefixMisses += countPrefixMisses(commits, ruleLandedAt(git, repo.path), range);
    sliceOverLimit += countSliceOverLimit(commits, sliceFileLimit(repo.path));
    merged += countMerged(commits);
    const counted = countReviewOutcomes(reviewTexts(git, repo.path, commits));
    outcomes.accepted += counted.accepted;
    outcomes.edited += counted.edited;
    outcomes.expanded += counted.expanded;
    outcomes.unknown += counted.unknown;
  }

  return {
    week,
    timezone,
    source: "local",
    summary: summarize(commitCount, prefixMisses, sliceOverLimit, merged, outcomes),
    alerts: [],
    outcomes,
    prefixMisses,
    sliceOverLimit,
    merged,
    reviewFixes: "unavailable",
    docsBlank: "unavailable",
    mergeDuration: "unavailable",
    repos,
  };
}

export function formatRetro(report: RetroReport): string {
  const lines = [
    `${report.week} (${report.timezone}, ${report.source})`,
    report.summary,
    "reviewFixes: unavailable",
    "docsBlank: unavailable",
    "mergeDuration: unavailable",
  ];
  for (const repo of report.repos) {
    if (repo.missing === true) lines.push(`missing: ${repo.path}`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatRetroMarkdown(report: RetroReport): string {
  const outcomes = report.outcomes;
  const lines = [
    `# ${report.week}`,
    "",
    `Timezone: ${report.timezone}. Source: local.`,
    "",
    report.summary,
    "",
    `Prefix misses: ${report.prefixMisses}. Slice over limit: ${report.sliceOverLimit}. Merged: ${report.merged}.`,
    `Outcomes: ${outcomes.accepted} accepted, ${outcomes.edited} edited, ${outcomes.expanded} expanded, ${outcomes.unknown} unknown.`,
    "Review fixes: unavailable. Docs blank: unavailable. Merge duration: unavailable.",
    "Alerts: none.",
  ];
  const missing = report.repos.filter((repo) => repo.missing === true);
  if (missing.length > 0) {
    lines.push("", "Missing repos:");
    for (const repo of missing) lines.push(`- ${repo.path}`);
  }
  return `${lines.join("\n")}\n`;
}

export function retroJson(report: RetroReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function writeTextAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    throw new AdminError(
      "filesystem",
      path,
      error instanceof Error ? error.message : `Cannot write ${path}.`,
    );
  }
}

export function saveRetro(adminRoot: string, report: RetroReport): void {
  const dir = join(resolve(adminRoot), "retros");
  writeTextAtomic(join(dir, `${report.week}.json`), retroJson(report));
  writeTextAtomic(join(dir, `${report.week}.md`), formatRetroMarkdown(report));
}
