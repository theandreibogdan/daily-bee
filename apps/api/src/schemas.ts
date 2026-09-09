import { z } from 'zod';

/**
 * Wire contracts. Every object is `.strict()` so a client can never smuggle extra fields
 * (a `url`, a `title`, a `tabs` list), and free text is checked for URL-shaped content.
 * Privacy rule: per-page URLs never leave the device; managers see app names and categories only.
 */
export const CATEGORIES = ['work', 'research', 'learning', 'communication', 'distraction'] as const;
export const Category = z.enum(CATEGORIES);
export const TaskSize = z.enum(['Trivial', 'Small', 'Medium', 'Large', 'Epic']);
export const Outcome = z.enum(['Done', 'Partly done', 'Not done', 'Handed off']);

const noUrls = (max: number) => z.string().max(max).refine((s) => !/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(s), { message: 'URLs are not accepted by the sync API' });

export const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const EntryPush = z.object({
  id: z.string().max(64),
  task: noUrls(300),
  ref: z.string().max(40).nullable(),
  project: z.string().max(80),
  startTs: z.number().int().nonnegative(),
  seconds: z.number().int().nonnegative(),
  done: z.boolean(),
  outcome: Outcome.nullable(),
  blocker: z.boolean(),
  size: TaskSize.nullable(),
  sizeCheck: TaskSize.nullable(),
}).strict();

export const CheckinPush = z.object({
  id: z.string().max(64),
  ts: z.number().int().nonnegative(),
  kind: z.enum(['drift', 'pulse', 'warning']),
  answer: z.string().max(60).nullable(),
}).strict();

export const Mix = z.object({ work: z.number().min(0).max(100), research: z.number().min(0).max(100), learning: z.number().min(0).max(100), communication: z.number().min(0).max(100), distraction: z.number().min(0).max(100) }).strict();

export const DayPush = z.object({
  day: DayKey,
  user: z.object({ name: noUrls(120), initials: z.string().min(1).max(4), email: z.email().max(200), team: z.string().max(80) }).strict(),
  tracking: z.boolean(),
  trackedSeconds: z.number().int().nonnegative(),
  entries: z.array(EntryPush).max(500),
  checkins: z.array(CheckinPush).max(200),
  mix: Mix,
  focus: z.number().min(0).max(100),
  /** App names only ("VS Code", "Google Chrome") — never pages */
  topApps: z.array(noUrls(80)).max(5),
  report: z.object({ status: z.enum(['draft', 'sent']), sentAt: z.number().int().nullable() }).strict().nullable(),
  shareFocus: z.boolean(),
}).strict();

export type DayPush = z.infer<typeof DayPush>;
export type EntryPush = z.infer<typeof EntryPush>;
export type CheckinPush = z.infer<typeof CheckinPush>;
export type Category = z.infer<typeof Category>;

export const TeamRange = z.enum(['day', 'week', 'month']);
export const AdminRange = z.enum(['week', 'month', 'quarter']);
export const PolicyRulesSchema = z.array(z.tuple([z.string().max(200), z.boolean()])).max(20);
