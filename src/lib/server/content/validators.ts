import { z } from 'zod';
import contentProjectsSeed from '../../../../data/content/projects.json';
import contentGoalsSeed from '../../../../data/content/goals.json';
import legacyProjectsSeed from '../../../data/geo/projects-metadata.json';
import legacyGoalsSeed from '../../../data/geo/goals-metadata.json';
import type { Goal, Project } from '@/types/content';
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
  if (err.issues.length === 0) {
    return 'invalid payload';
  }

  const firstIssue = err.issues[0];
  const path = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'payload';
  return `${path}: ${firstIssue.message}`;
}

function parseSchema<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw new ContentStoreError(400, `${label} validation failed - ${zodErrorToMessage(parsed.error)}`);
}

export function assertNoForbiddenWriteFields(payload: Record<string, unknown>, label: string) {
  for (const field of FORBIDDEN_MUTATION_FIELDS) {
    if (field in payload) {
      throw new ContentStoreError(
        400,
        `${label} contains server-managed field "${field}". Use archive/restore endpoints instead.`
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
