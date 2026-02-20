import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import contentProjectsSeed from '../../../../data/content/projects.json';
import contentGoalsSeed from '../../../../data/content/goals.json';
import contentHistorySeed from '../../../../data/content/history.json';
import legacyProjectsSeed from '../../../data/geo/projects-metadata.json';
import legacyGoalsSeed from '../../../data/geo/goals-metadata.json';
import type {
  ContentEntityType,
  ContentHistoryEvent,
  Goal,
  Project,
} from '@/types/content';

const CONTENT_ROOT = path.resolve(process.cwd(), 'data', 'content');
const PROJECTS_PATH = path.join(CONTENT_ROOT, 'projects.json');
const GOALS_PATH = path.join(CONTENT_ROOT, 'goals.json');
const HISTORY_PATH = path.join(CONTENT_ROOT, 'history.json');

const LEGACY_PROJECTS_PATH = path.resolve(process.cwd(), 'src', 'data', 'geo', 'projects-metadata.json');
const LEGACY_GOALS_PATH = path.resolve(process.cwd(), 'src', 'data', 'geo', 'goals-metadata.json');
const IS_CLOUDFLARE_WORKER =
  typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';

const inMemoryStore: {
  initialized: boolean;
  projects: Project[];
  goals: Goal[];
  history: ContentHistoryEvent[];
} = {
  initialized: false,
  projects: [],
  goals: [],
  history: [],
};

let initPromise: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FORBIDDEN_MUTATION_FIELDS = new Set(['is_archived', 'archived_at', 'archived_by']);

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

const projectCreateSchema = z
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

const projectPatchSchema = projectCreateSchema.partial();

const goalCreateSchema = z
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

const goalPatchSchema = goalCreateSchema.partial();

export class ContentStoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContentStoreError';
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return structuredClone(value);
}

function asSeedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? structuredClone(value as T[]) : [];
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

function assertNoForbiddenWriteFields(payload: Record<string, unknown>, label: string) {
  for (const field of FORBIDDEN_MUTATION_FIELDS) {
    if (field in payload) {
      throw new ContentStoreError(
        400,
        `${label} contains server-managed field "${field}". Use archive/restore endpoints instead.`
      );
    }
  }
}

function ensureInMemoryStoreReady() {
  if (inMemoryStore.initialized) {
    return;
  }

  const seededProjects = asSeedArray<Project>(contentProjectsSeed);
  const seededGoals = asSeedArray<Goal>(contentGoalsSeed);

  inMemoryStore.projects =
    seededProjects.length > 0 ? seededProjects : asSeedArray<Project>(legacyProjectsSeed);
  inMemoryStore.goals = seededGoals.length > 0 ? seededGoals : asSeedArray<Goal>(legacyGoalsSeed);
  inMemoryStore.history = asSeedArray<ContentHistoryEvent>(contentHistorySeed);
  inMemoryStore.initialized = true;
}

function readInMemoryArray<T>(filePath: string): T[] {
  ensureInMemoryStoreReady();

  if (filePath === PROJECTS_PATH) {
    return structuredClone(inMemoryStore.projects as T[]);
  }

  if (filePath === GOALS_PATH) {
    return structuredClone(inMemoryStore.goals as T[]);
  }

  if (filePath === HISTORY_PATH) {
    return structuredClone(inMemoryStore.history as T[]);
  }

  throw new ContentStoreError(500, `unknown content path: ${filePath}`);
}

function writeInMemoryArray(filePath: string, data: unknown[]) {
  ensureInMemoryStoreReady();
  const next = structuredClone(data);

  if (filePath === PROJECTS_PATH) {
    inMemoryStore.projects = next as Project[];
    return;
  }

  if (filePath === GOALS_PATH) {
    inMemoryStore.goals = next as Goal[];
    return;
  }

  if (filePath === HISTORY_PATH) {
    inMemoryStore.history = next as ContentHistoryEvent[];
    return;
  }

  throw new ContentStoreError(500, `unknown content path: ${filePath}`);
}

function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(work, work);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureSeedFile(filePath: string, fallbackPath?: string) {
  try {
    await fs.access(filePath);
    return;
  } catch {
    // expected when file does not exist
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let seed: unknown[] = [];
  if (fallbackPath) {
    try {
      const raw = await fs.readFile(fallbackPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        seed = parsed;
      }
    } catch {
      seed = [];
    }
  }

  await writeJsonArray(filePath, seed);
}

async function ensureStoreReady() {
  if (IS_CLOUDFLARE_WORKER) {
    ensureInMemoryStoreReady();
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      await ensureSeedFile(PROJECTS_PATH, LEGACY_PROJECTS_PATH);
      await ensureSeedFile(GOALS_PATH, LEGACY_GOALS_PATH);
      await ensureSeedFile(HISTORY_PATH);
    })();
  }
  await initPromise;
}

async function readJsonArray<T>(filePath: string, label: string): Promise<T[]> {
  if (IS_CLOUDFLARE_WORKER) {
    const memoryItems = readInMemoryArray<T>(filePath);
    if (!Array.isArray(memoryItems)) {
      throw new ContentStoreError(500, `${label} store is invalid`);
    }
    return memoryItems;
  }

  await ensureStoreReady();
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new ContentStoreError(500, `${label} store is invalid`);
  }
  return parsed as T[];
}

async function writeJsonArray(filePath: string, data: unknown[]) {
  if (IS_CLOUDFLARE_WORKER) {
    writeInMemoryArray(filePath, data);
    return;
  }

  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, filePath);
}

function ensureProvenance(
  value: unknown,
  actor: string,
  timestamp: string,
  isCreate: boolean
): Record<string, unknown> {
  const provenance = isRecord(value) ? { ...value } : {};
  const createdAt = typeof provenance.created_at === 'string' ? provenance.created_at : timestamp;
  const createdBy = typeof provenance.created_by === 'string' ? provenance.created_by : actor;

  provenance.created_at = createdAt;
  provenance.created_by = createdBy;
  provenance.updated_at = timestamp;
  provenance.updated_by = actor;

  if (isCreate && typeof provenance.license !== 'string') {
    provenance.license = 'CC-BY-4.0';
  }

  return provenance;
}

function applyArchiveFields(
  entity: Record<string, unknown>,
  actor: string,
  timestamp: string,
  previousArchived: boolean
) {
  const archived = entity.is_archived === true;
  if (archived && !previousArchived) {
    entity.archived_at = timestamp;
    entity.archived_by = actor;
  }

  if (!archived && previousArchived) {
    entity.archived_at = null;
    entity.archived_by = null;
  }

  if (!archived) {
    entity.archived_at = null;
    entity.archived_by = null;
  }
}

function toProjectCreate(input: unknown): Project {
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

function toGoalCreate(input: unknown): Goal {
  const payload = parseSchema(goalCreateSchema, input, 'goal');
  assertNoForbiddenWriteFields(payload, 'goal payload');

  return {
    ...payload,
  } as Goal;
}

function toProjectPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(projectPatchSchema, input, 'project patch');
  assertNoForbiddenWriteFields(payload, 'project patch');
  return payload;
}

function toGoalPatch(input: unknown): Record<string, unknown> {
  const payload = parseSchema(goalPatchSchema, input, 'goal patch');
  assertNoForbiddenWriteFields(payload, 'goal patch');
  return payload;
}

function buildHistoryEvent(params: {
  entityType: ContentEntityType;
  entityId: string;
  action: ContentHistoryEvent['action'];
  actor: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  timestamp: string;
}): ContentHistoryEvent {
  return {
    id: randomUUID(),
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    actor: params.actor,
    timestamp: params.timestamp,
    before: params.before ?? null,
    after: params.after ?? null,
  };
}

async function appendHistory(event: ContentHistoryEvent) {
  const history = await readJsonArray<ContentHistoryEvent>(HISTORY_PATH, 'history');
  history.push(event);
  await writeJsonArray(HISTORY_PATH, history);
}

function includeByArchiveState<T extends { is_archived?: boolean }>(
  items: T[],
  includeArchived: boolean
) {
  if (includeArchived) {
    return items;
  }
  return items.filter((item) => item.is_archived !== true);
}

export async function listProjects(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived === true;
  const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
  return includeByArchiveState(projects, includeArchived);
}

export async function listGoals(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived === true;
  const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
  return includeByArchiveState(goals, includeArchived);
}

export async function getProjectById(id: string, options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived !== false;
  const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
  const project = projects.find((item) => item.id === id);
  if (!project || (!includeArchived && project.is_archived === true)) {
    throw new ContentStoreError(404, `project ${id} not found`);
  }
  return project;
}

export async function getGoalById(id: string, options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived !== false;
  const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
  const goal = goals.find((item) => item.id === id);
  if (!goal || (!includeArchived && goal.is_archived === true)) {
    throw new ContentStoreError(404, `goal ${id} not found`);
  }
  return goal;
}

export async function createProject(input: unknown, actor: string) {
  const candidate = toProjectCreate(input);
  const timestamp = nowIso();

  return withWriteLock(async () => {
    const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
    if (projects.some((item) => item.id === candidate.id)) {
      throw new ContentStoreError(409, `project ${candidate.id} already exists`);
    }

    const created: Project = {
      ...candidate,
      is_archived: false,
      archived_at: null,
      archived_by: null,
      provenance: ensureProvenance(candidate.provenance, actor, timestamp, true),
    };

    projects.push(created);
    await writeJsonArray(PROJECTS_PATH, projects);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'project',
        entityId: created.id,
        action: 'create',
        actor,
        timestamp,
        before: null,
        after: cloneRecord(created as Record<string, unknown>),
      })
    );

    return created;
  });
}

export async function createGoal(input: unknown, actor: string) {
  const candidate = toGoalCreate(input);
  const timestamp = nowIso();

  return withWriteLock(async () => {
    const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
    if (goals.some((item) => item.id === candidate.id)) {
      throw new ContentStoreError(409, `goal ${candidate.id} already exists`);
    }

    const created: Goal = {
      ...candidate,
      is_archived: false,
      archived_at: null,
      archived_by: null,
      provenance: ensureProvenance(candidate.provenance, actor, timestamp, true),
    };

    goals.push(created);
    await writeJsonArray(GOALS_PATH, goals);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'goal',
        entityId: created.id,
        action: 'create',
        actor,
        timestamp,
        before: null,
        after: cloneRecord(created as Record<string, unknown>),
      })
    );

    return created;
  });
}

export async function updateProject(id: string, patchInput: unknown, actor: string) {
  const patch = toProjectPatch(patchInput);
  const timestamp = nowIso();

  return withWriteLock(async () => {
    const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
    const index = projects.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `project ${id} not found`);
    }

    if (typeof patch.id === 'string' && patch.id !== id) {
      throw new ContentStoreError(400, 'project id in payload does not match route id');
    }

    const previous = projects[index] as Record<string, unknown>;
    const previousArchived = previous.is_archived === true;
    const before = cloneRecord(previous);

    const merged: Record<string, unknown> = {
      ...previous,
      ...patch,
      id,
    };

    merged.provenance = ensureProvenance(merged.provenance, actor, timestamp, false);
    applyArchiveFields(merged, actor, timestamp, previousArchived);

    projects[index] = merged as Project;
    await writeJsonArray(PROJECTS_PATH, projects);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'project',
        entityId: id,
        action: 'update',
        actor,
        timestamp,
        before,
        after: cloneRecord(merged),
      })
    );

    return projects[index];
  });
}

export async function updateGoal(id: string, patchInput: unknown, actor: string) {
  const patch = toGoalPatch(patchInput);
  const timestamp = nowIso();

  return withWriteLock(async () => {
    const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
    const index = goals.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `goal ${id} not found`);
    }

    if (typeof patch.id === 'string' && patch.id !== id) {
      throw new ContentStoreError(400, 'goal id in payload does not match route id');
    }

    const previous = goals[index] as Record<string, unknown>;
    const previousArchived = previous.is_archived === true;
    const before = cloneRecord(previous);

    const merged: Record<string, unknown> = {
      ...previous,
      ...patch,
      id,
    };

    merged.provenance = ensureProvenance(merged.provenance, actor, timestamp, false);
    applyArchiveFields(merged, actor, timestamp, previousArchived);

    goals[index] = merged as Goal;
    await writeJsonArray(GOALS_PATH, goals);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'goal',
        entityId: id,
        action: 'update',
        actor,
        timestamp,
        before,
        after: cloneRecord(merged),
      })
    );

    return goals[index];
  });
}

export async function archiveProject(id: string, actor: string) {
  return withWriteLock(async () => {
    const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
    const index = projects.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `project ${id} not found`);
    }

    const timestamp = nowIso();
    const before = cloneRecord(projects[index] as Record<string, unknown>);
    const updated: Project = {
      ...projects[index],
      is_archived: true,
      archived_at: timestamp,
      archived_by: actor,
      provenance: ensureProvenance(projects[index].provenance, actor, timestamp, false),
    };

    projects[index] = updated;
    await writeJsonArray(PROJECTS_PATH, projects);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'project',
        entityId: id,
        action: 'archive',
        actor,
        timestamp,
        before,
        after: cloneRecord(updated as Record<string, unknown>),
      })
    );

    return updated;
  });
}

export async function restoreProject(id: string, actor: string) {
  return withWriteLock(async () => {
    const projects = await readJsonArray<Project>(PROJECTS_PATH, 'projects');
    const index = projects.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `project ${id} not found`);
    }

    const timestamp = nowIso();
    const before = cloneRecord(projects[index] as Record<string, unknown>);
    const updated: Project = {
      ...projects[index],
      is_archived: false,
      archived_at: null,
      archived_by: null,
      provenance: ensureProvenance(projects[index].provenance, actor, timestamp, false),
    };

    projects[index] = updated;
    await writeJsonArray(PROJECTS_PATH, projects);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'project',
        entityId: id,
        action: 'restore',
        actor,
        timestamp,
        before,
        after: cloneRecord(updated as Record<string, unknown>),
      })
    );

    return updated;
  });
}

export async function archiveGoal(id: string, actor: string) {
  return withWriteLock(async () => {
    const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
    const index = goals.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `goal ${id} not found`);
    }

    const timestamp = nowIso();
    const before = cloneRecord(goals[index] as Record<string, unknown>);
    const updated: Goal = {
      ...goals[index],
      is_archived: true,
      archived_at: timestamp,
      archived_by: actor,
      provenance: ensureProvenance(goals[index].provenance, actor, timestamp, false),
    };

    goals[index] = updated;
    await writeJsonArray(GOALS_PATH, goals);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'goal',
        entityId: id,
        action: 'archive',
        actor,
        timestamp,
        before,
        after: cloneRecord(updated as Record<string, unknown>),
      })
    );

    return updated;
  });
}

export async function restoreGoal(id: string, actor: string) {
  return withWriteLock(async () => {
    const goals = await readJsonArray<Goal>(GOALS_PATH, 'goals');
    const index = goals.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new ContentStoreError(404, `goal ${id} not found`);
    }

    const timestamp = nowIso();
    const before = cloneRecord(goals[index] as Record<string, unknown>);
    const updated: Goal = {
      ...goals[index],
      is_archived: false,
      archived_at: null,
      archived_by: null,
      provenance: ensureProvenance(goals[index].provenance, actor, timestamp, false),
    };

    goals[index] = updated;
    await writeJsonArray(GOALS_PATH, goals);

    await appendHistory(
      buildHistoryEvent({
        entityType: 'goal',
        entityId: id,
        action: 'restore',
        actor,
        timestamp,
        before,
        after: cloneRecord(updated as Record<string, unknown>),
      })
    );

    return updated;
  });
}

export async function listHistory(options: {
  entityType?: ContentEntityType;
  entityId?: string;
  limit?: number;
} = {}) {
  const limit = typeof options.limit === 'number' && options.limit > 0 ? Math.floor(options.limit) : 200;
  const history = await readJsonArray<ContentHistoryEvent>(HISTORY_PATH, 'history');

  let filtered = history;
  if (options.entityType) {
    filtered = filtered.filter((event) => event.entity_type === options.entityType);
  }

  if (options.entityId) {
    filtered = filtered.filter((event) => event.entity_id === options.entityId);
  }

  return filtered
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
