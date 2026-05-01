// Public barrel for the content store. Splits into:
//   - errors.ts     : ContentStoreError
//   - validators.ts : Zod schemas, parseSchema, to*Create/Patch/Seed, assertNoForbiddenWriteFields
//   - mappers.ts    : provenance/archive helpers, normalizeEntityForStorage, row↔entity
//   - repository.ts : SQL constants, getDb, executeInBatches, find*Row
//   - seeding.ts    : ensureSeeded + the 3 split seedXxxIfEmpty functions
//   - service.ts    : public CRUD operations + listHistory
//
// External callers should import from this file; internal modules import
// from each other through the DAG above (no cycles).

export { ContentStoreError } from './errors';

export {
  assertNoForbiddenWriteFields,
  goalCreateSchema,
  goalPatchSchema,
  projectCreateSchema,
  projectPatchSchema,
} from './validators';

export {
  archiveGoal,
  archiveProject,
  createGoal,
  createProject,
  getGoalById,
  getProjectById,
  listGoals,
  listHistory,
  listProjects,
  restoreGoal,
  restoreProject,
  updateGoal,
  updateProject,
} from './service';
