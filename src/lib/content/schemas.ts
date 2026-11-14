import { z } from 'zod';
import { hasLoneSurrogate } from '#utils/timedActions.ts';

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
    url: z.httpUrl().optional(),
  })
  .passthrough();

const relatedOrgSchema = z
  .object({
    name: nonEmptyStringSchema.max(160),
    url: z.httpUrl().optional(),
    contact_info: z.string().max(600).optional(),
  })
  .passthrough();

const contentSourceSchema = z
  .object({
    label: nonEmptyStringSchema.max(200),
    url: z.httpUrl(),
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

export const TIMED_ACTION_MAX_DAYS_AHEAD = 366;

export const FIELD_LIMITS = { description: 300, label: 40, address: 200 } as const;

export function hasNoCredentials(url: string): boolean {
  if (!URL.canParse(url)) {
    return true;
  }
  const parsed = new URL(url);
  return parsed.username === '' && parsed.password === '';
}

const wellFormedText = (text: string) => !hasLoneSurrogate(text);
const ILL_FORMED = 'must be well-formed text';

const timedActionLinkSchema = z.strictObject({
  label: nonEmptyStringSchema.max(FIELD_LIMITS.label).refine(wellFormedText, ILL_FORMED),
  url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.httpUrl())
    .refine(hasNoCredentials, 'must not contain credentials'),
});

const timedActionLocationSchema = z.strictObject({
  label: nonEmptyStringSchema.max(FIELD_LIMITS.label).refine(wellFormedText, ILL_FORMED),
  address: nonEmptyStringSchema.max(FIELD_LIMITS.address).refine(wellFormedText, ILL_FORMED),
});

export const timedActionInputSchema = z.strictObject({
  goal_id: idSchema,
  description: nonEmptyStringSchema
    .max(FIELD_LIMITS.description)
    .refine(wellFormedText, ILL_FORMED),
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

export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function timedActionWindowError(
  expiresOn: string,
  today: string,
  previousExpiresOn?: string,
): string | null {
  if (previousExpiresOn === expiresOn) {
    return null;
  }
  const latest = addDays(today, TIMED_ACTION_MAX_DAYS_AHEAD);
  if (expiresOn < today || expiresOn > latest) {
    return `must be between ${today} and ${latest}`;
  }
  return null;
}
