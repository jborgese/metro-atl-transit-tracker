import type { z } from 'zod';
import {
  goalCreateSchema,
  goalPatchSchema,
  projectCreateSchema,
  projectPatchSchema,
  timedActionCreateSchema,
  timedActionReplaceSchema,
  timedActionWindowError,
} from '#lib/content/schemas.ts';
import { fieldLabel } from './labels';
import type { WriteMode } from './payload';
import type { ContentKind, ContentRecord } from './types';

export interface FieldIssue {
  path: string;
  message: string;
}

export interface ValidationContext {
  today: string;
  goals: Array<{ id: string; is_archived?: boolean }>;
  existingIds: string[];
  loaded: ContentRecord | null;
}

type ZodIssue = z.core.$ZodIssue;
type Body = Record<string, unknown>;

const MISSING_TOP_LEVEL: Record<string, string> = {
  id: 'Enter an id',
  title: 'Enter a title',
  goal: 'Enter the goal',
  description: 'Enter a description',
  expires_on: 'Choose a last day',
  goal_id: 'Choose a goal',
};

const LEAD_ORG_MESSAGE = "Enter the lead organisation's name. It can be changed but not removed.";

const SCHEMAS = {
  project: { create: projectCreateSchema, update: projectPatchSchema },
  goal: { create: goalCreateSchema, update: goalPatchSchema },
  timed_action: { create: timedActionCreateSchema, update: timedActionReplaceSchema },
};

function isObject(value: unknown): value is Body {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAt(body: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), body);
}

function isMissing(issue: ZodIssue, path: string, body: Body): boolean {
  if (issue.code === 'too_small') {
    return issue.origin === 'string' && Number(issue.minimum) === 1;
  }
  return issue.code === 'invalid_type' && valueAt(body, path) === undefined;
}

function missingMessage(path: string, label: string): string | null {
  if (path.includes('.')) {
    return `${label}: enter a value`;
  }
  return MISSING_TOP_LEVEL[path] ?? null;
}

function formatMessage(issue: ZodIssue, label: string): string | null {
  if (issue.code !== 'invalid_format') {
    return null;
  }
  if (issue.format === 'url') {
    return `${label}: enter a full web address starting with https://`;
  }
  if (issue.format === 'date') {
    return `${label}: enter a real date`;
  }
  return issue.format === 'regex' ? 'Use lowercase letters, numbers and hyphens only' : null;
}

function customMessage(issue: ZodIssue, label: string): string | null {
  if (issue.code !== 'custom') {
    return null;
  }
  if (issue.message === 'must not contain credentials') {
    return `${label}: remove the username and password from the web address`;
  }
  if (issue.message === 'must be well-formed text') {
    return `${label} contains a character that cannot be saved; retype it`;
  }
  return null;
}

function tooBigMessage(issue: ZodIssue, label: string): string | null {
  if (issue.code !== 'too_big' || issue.origin !== 'string') {
    return null;
  }
  return `${label} must be ${issue.maximum} characters or fewer`;
}

function describeIssue(kind: ContentKind, issue: ZodIssue, body: Body): FieldIssue {
  const path = issue.path.join('.');
  const label = fieldLabel(kind, path);
  if (issue.code === 'unrecognized_keys') {
    return { path, message: `Actions cannot have other fields: ${issue.keys.join(', ')}` };
  }
  const missing = isMissing(issue, path, body) ? missingMessage(path, label) : null;
  const message =
    missing ??
    tooBigMessage(issue, label) ??
    formatMessage(issue, label) ??
    customMessage(issue, label) ??
    `${label}: ${issue.message}`;
  return { path, message };
}

function schemaIssues(kind: ContentKind, mode: WriteMode, body: Body): Map<string, string> {
  const result = SCHEMAS[kind][mode].safeParse(body);
  const issues = new Map<string, string>();
  if (!result.success) {
    for (const issue of result.error.issues) {
      const { path, message } = describeIssue(kind, issue, body);
      if (!issues.has(path)) {
        issues.set(path, message);
      }
    }
  }
  return issues;
}

function windowMessage(body: Body, context: ValidationContext): string | null {
  if (typeof body.expires_on !== 'string') {
    return null;
  }
  const previous = context.loaded?.expires_on;
  const text = timedActionWindowError(
    body.expires_on,
    context.today,
    typeof previous === 'string' ? previous : undefined,
  );
  return text === null ? null : `Last day ${text}`;
}

function goalMessage(mode: WriteMode, body: Body, context: ValidationContext): string | null {
  if (mode === 'update' && body.goal_id === context.loaded?.goal_id) {
    return null;
  }
  const goal = context.goals.find((candidate) => candidate.id === body.goal_id);
  if (goal === undefined) {
    return 'Choose a goal';
  }
  return goal.is_archived === true ? 'Choose a goal that is not archived' : null;
}

function duplicateMessage(
  kind: ContentKind,
  body: Body,
  context: ValidationContext,
): string | null {
  if (typeof body.id !== 'string' || !context.existingIds.includes(body.id.trim())) {
    return null;
  }
  const noun = kind === 'goal' ? 'goal' : 'project';
  return `A ${noun} with this id already exists, including archived ones`;
}

function leadOrgBlanked(body: Body, context: ValidationContext): boolean {
  if (!isObject(context.loaded?.lead_org) || !isObject(body.lead_org)) {
    return false;
  }
  const { name } = body.lead_org;
  return name === undefined || (typeof name === 'string' && name.trim() === '');
}

function addIfAbsent(issues: Map<string, string>, path: string, message: string | null): void {
  if (message !== null && !issues.has(path)) {
    issues.set(path, message);
  }
}

function addContextIssues(
  kind: ContentKind,
  mode: WriteMode,
  body: Body,
  context: ValidationContext,
  issues: Map<string, string>,
): void {
  if (kind === 'timed_action') {
    addIfAbsent(issues, 'expires_on', windowMessage(body, context));
    addIfAbsent(issues, 'goal_id', goalMessage(mode, body, context));
    return;
  }
  if (mode === 'create') {
    addIfAbsent(issues, 'id', duplicateMessage(kind, body, context));
  }
  if (kind === 'project' && mode === 'update' && leadOrgBlanked(body, context)) {
    issues.set('lead_org.name', LEAD_ORG_MESSAGE);
  }
}

export function validatePayload(
  kind: ContentKind,
  mode: WriteMode,
  body: Record<string, unknown>,
  context: ValidationContext,
): FieldIssue[] {
  const issues = schemaIssues(kind, mode, body);
  addContextIssues(kind, mode, body, context, issues);
  return [...issues].map(([path, message]) => ({ path, message }));
}
