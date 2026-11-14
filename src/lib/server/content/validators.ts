import { z } from 'zod';
import contentProjectsSeed from '../../../../data/content/projects.json';
import contentGoalsSeed from '../../../../data/content/goals.json';
import legacyProjectsSeed from '../../../data/geo/projects-metadata.json';
import legacyGoalsSeed from '../../../data/geo/goals-metadata.json';
import type { Goal, Project, TimedActionLink, TimedActionLocation } from '#types/content.ts';
import { ContentStoreError } from './errors';

export const SEED_ACTOR = 'seed';
export const FORBIDDEN_MUTATION_FIELDS = new Set(['is_archived', 'archived_at', 'archived_by']);
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const nonEmptyStringSchema = z.string().trim().min(1);
const idSchema = nonEmptyStringSchema
  .max(120)
  .regex(ID_PATTERN, 'must use lowercase letters, numbers, and hyphens only');
const nullableDateStringSchema = z.union([nonEmptyStringSchema.max(120), z.null()]);
const provenanceSchema = z.record(z.string(), z.unknown());
const genericRecordSchema = z.record(z.string(), z.unknown());

const organizationRefSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    url: z.string().trim().url().optional(),
  })
  .passthrough();

const relatedOrgSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    url: z.string().trim().url().optional(),
    contact_info: z.string().max(600).optional(),
  })
  .passthrough();

const contentSourceSchema = z
  .object({
    label: nonEmptyStringSchema.max(200),
    url: z.string().trim().url(),
    last_verified: nonEmptyStringSchema.max(120).optional(),
  })
  .passthrough();

export const projectCreateSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema.max(240),
    summary: z.string().max(5000).optional(),
    status: nonEmptyStringSchema.max(120).optional(),
    lead_org: organizationRefSchema.optional(),
    partners: z.array(organizationRefSchema).optional(),
    start_date: nullableDateStringSchema.optional(),
    end_date: nullableDateStringSchema.optional(),
    milestones: z.array(genericRecordSchema).optional(),
    geo_scope: nonEmptyStringSchema.max(160).optional(),
    modes: z.array(nonEmptyStringSchema.max(120)).optional(),
    related_counties: z.array(nonEmptyStringSchema.max(120)).optional(),
    sources: z.array(contentSourceSchema).optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

export const projectPatchSchema = projectCreateSchema.partial();

export const goalCreateSchema = z
  .object({
    id: idSchema,
    goal: nonEmptyStringSchema.max(2000),
    status_related_projects: z.string().max(5000).optional(),
    actions: z.string().max(5000).optional(),
    related_orgs: z.array(relatedOrgSchema).optional(),
    related_project_ids: z.array(idSchema).optional(),
    related_counties: z.array(nonEmptyStringSchema.max(120)).optional(),
    provenance: provenanceSchema.optional(),
  })
  .passthrough();

export const goalPatchSchema = goalCreateSchema.partial();

const TIMED_ACTION_MAX_DAYS_AHEAD = 366;

export interface TimedActionInput {
  goal_id: string;
  description: string;
  link: TimedActionLink | null;
  location: TimedActionLocation | null;
  expires_on: string;
}

function hasNoCredentials(url: string): boolean {
  if (!URL.canParse(url)) {
    return true;
  }
  const parsed = new URL(url);
  return parsed.username === '' && parsed.password === '';
}

const timedActionLinkSchema = z.strictObject({
  label: nonEmptyStringSchema.max(40),
  url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.httpUrl())
    .refine(hasNoCredentials, 'must not contain credentials'),
});

const timedActionLocationSchema = z.strictObject({
  label: nonEmptyStringSchema.max(40),
  address: nonEmptyStringSchema.max(200),
});

export const timedActionInputSchema = z.strictObject({
  goal_id: idSchema,
  description: nonEmptyStringSchema.max(300),
  link: timedActionLinkSchema.nullable(),
  location: timedActionLocationSchema.nullable(),
  expires_on: z.iso.date(),
});

export const timedActionCreateSchema = z.strictObject({
  goal_id: timedActionInputSchema.shape.goal_id,
  description: timedActionInputSchema.shape.description,
  link: timedActionLinkSchema.nullable().default(null),
  location: timedActionLocationSchema.nullable().default(null),
  expires_on: timedActionInputSchema.shape.expires_on,
  provenance: provenanceSchema.optional(),
});

export const timedActionReplaceSchema = z.strictObject({
  id: z.string().optional(),
  goal_id: timedActionInputSchema.shape.goal_id,
  description: timedActionInputSchema.shape.description,
  link: timedActionLinkSchema.nullable().default(null),
  location: timedActionLocationSchema.nullable().default(null),
  expires_on: timedActionInputSchema.shape.expires_on,
  provenance: provenanceSchema.optional(),
});

function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function assertTimedActionDateWindow(expiresOn: string, today: string) {
  if (expiresOn < today || expiresOn > addDays(today, TIMED_ACTION_MAX_DAYS_AHEAD)) {
    throw new ContentStoreError(
      400,
      `timed action validation failed - expires_on: must be between ${today} and ${addDays(today, TIMED_ACTION_MAX_DAYS_AHEAD)}`,
    );
  }
}

function assertNoForbiddenTimedActionFields(input: unknown) {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    assertNoForbiddenWriteFields(input as Record<string, unknown>, 'timed action payload');
  }
}

export function toTimedActionCreate(input: unknown, today: string): TimedActionInput {
  assertNoForbiddenTimedActionFields(input);
  if (typeof input === 'object' && input !== null && 'id' in input) {
    throw new ContentStoreError(
      400,
      'timed action validation failed - id: is generated by the server',
    );
  }
  const { provenance: _provenance, ...payload } = parseSchema(
    timedActionCreateSchema,
    input,
    'timed action',
  );
  assertTimedActionDateWindow(payload.expires_on, today);
  return payload;
}

export function toTimedActionReplace(
  input: unknown,
  id: string,
  previousExpiresOn: string,
  today: string,
): TimedActionInput {
  assertNoForbiddenTimedActionFields(input);
  const {
    id: bodyId,
    provenance: _provenance,
    ...payload
  } = parseSchema(timedActionReplaceSchema, input, 'timed action');
  if (bodyId !== undefined && bodyId !== id) {
    throw new ContentStoreError(
      400,
      'timed action validation failed - id: must match the id in the path',
    );
  }
  if (payload.expires_on !== previousExpiresOn) {
    assertTimedActionDateWindow(payload.expires_on, today);
  }
  return payload;
}

export function generateTimedActionId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    alphabet.charAt(byte % alphabet.length),
  ).join('');
  return `ta-${suffix}`;
}

export function asSeedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? structuredClone(value as T[]) : [];
}

export function parseIntSafe(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function isMissingTableError(err: unknown) {
  if (!(err instanceof Error)) {
    return false;
  }
  return /no such table|SQLITE_ERROR/i.test(err.message);
}

export function isUniqueConstraintError(err: unknown) {
  if (!(err instanceof Error)) {
    return false;
  }
  return /unique|constraint/i.test(err.message);
}

function zodErrorToMessage(err: z.ZodError) {
  const firstIssue = err.issues[0];
  if (!firstIssue) {
    return 'invalid payload';
  }

  const path = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'payload';
  return `${path}: ${firstIssue.message}`;
}

function parseSchema<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw new ContentStoreError(
    400,
    `${label} validation failed - ${zodErrorToMessage(parsed.error)}`,
  );
}

export function assertNoForbiddenWriteFields(payload: Record<string, unknown>, label: string) {
  for (const field of FORBIDDEN_MUTATION_FIELDS) {
    if (field in payload) {
      throw new ContentStoreError(
        400,
        `${label} contains server-managed field "${field}". Use archive/restore endpoints instead.`,
      );
    }
  }
}

export function toProjectCreate(input: unknown): Project {
  const payload = parseSchema(projectCreateSchema, input, 'project');
  const summary = typeof payload.summary === 'string' ? payload.summary : '';
  const status = typeof payload.status === 'string' ? payload.status : 'planning';
  assertNoForbiddenWriteFields(payload, 'project payload');

  return {
    ...payload,
    summary,
    status,
  } as Project;
}

export function toGoalCreate(input: unknown): Goal {
  const payload = parseSchema(goalCreateSchema, input, 'goal');
  assertNoForbiddenWriteFields(payload, 'goal payload');

  return {
    ...payload,
  } as Goal;
}

export function toProjectPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(projectPatchSchema, input, 'project patch');
  assertNoForbiddenWriteFields(payload, 'project patch');
  return payload;
}

export function toGoalPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(goalPatchSchema, input, 'goal patch');
  assertNoForbiddenWriteFields(payload, 'goal patch');
  return payload;
}

export function toProjectSeed(input: unknown): Project {
  const payload = parseSchema(projectCreateSchema, input, 'project seed');
  const summary = typeof payload.summary === 'string' ? payload.summary : '';
  const status = typeof payload.status === 'string' ? payload.status : 'planning';
  return {
    ...payload,
    summary,
    status,
  } as Project;
}

export function toGoalSeed(input: unknown): Goal {
  const payload = parseSchema(goalCreateSchema, input, 'goal seed');
  return {
    ...payload,
  } as Goal;
}

export function selectProjectSeeds() {
  const canonical = asSeedArray<Project>(contentProjectsSeed);
  if (canonical.length > 0) {
    return canonical;
  }
  return asSeedArray<Project>(legacyProjectsSeed);
}

export function selectGoalSeeds() {
  const canonical = asSeedArray<Goal>(contentGoalsSeed);
  if (canonical.length > 0) {
    return canonical;
  }
  return asSeedArray<Goal>(legacyGoalsSeed);
}
