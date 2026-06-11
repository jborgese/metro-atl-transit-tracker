import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  goalCreateSchema,
  goalPatchSchema,
  projectCreateSchema,
  projectPatchSchema,
} from '$lib/server/content/validators';
import { feedbackCreateSchema } from '$lib/server/feedback/validators';

// Extend Zod with `.openapi()` BEFORE we touch any schemas in this module.
// Zod 4 copies prototype methods onto each instance at construction time, so
// schemas built in validators.ts (before this call) lack `.openapi()`. We
// re-construct them here via `.clone()` once the prototype is patched.
extendZodWithOpenApi(z);

function withOpenApi<T extends z.ZodType>(schema: T): T {
  return schema.clone() as T;
}

const idParam = z.string().openapi({
  example: 'cobb-rapid-bus',
  description: 'Stable, lowercase, hyphenated identifier.',
});

const includeArchivedQuery = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .optional()
  .openapi({ description: 'Include archived rows in the response.' });

const historyEvent = z.object({
  id: z.string(),
  entity_type: z.union([z.literal('project'), z.literal('goal')]),
  entity_id: z.string(),
  action: z.union([
    z.literal('create'),
    z.literal('update'),
    z.literal('archive'),
    z.literal('restore'),
  ]),
  actor: z.string(),
  timestamp: z.string(),
  before: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  after: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const meResponse = z.object({
  identity: z.string(),
  actor: z.string(),
  display_name: z.union([z.string(), z.null()]),
});

const errorResponse = z.object({ message: z.string() });

const meUpdate = z.object({
  display_name: z.union([z.string(), z.null()]).optional(),
});

function jsonContent<T extends z.ZodType>(schema: T) {
  return { 'application/json': { schema } };
}

export function buildOpenApiDocument(serverUrl = '/') {
  const registry = new OpenAPIRegistry();

  const projectSchema = registry.register('Project', withOpenApi(projectCreateSchema));
  const projectPatch = registry.register('ProjectPatch', withOpenApi(projectPatchSchema));
  const goalSchema = registry.register('Goal', withOpenApi(goalCreateSchema));
  const goalPatch = registry.register('GoalPatch', withOpenApi(goalPatchSchema));
  const errorSchema = registry.register('ErrorResponse', errorResponse);
  const historySchema = registry.register('HistoryEvent', historyEvent);
  const meSchema = registry.register('Me', meResponse);
  const meUpdateSchema = registry.register('MeUpdate', meUpdate);
  const feedbackSchema = registry.register(
    'FeedbackCreate',
    withOpenApi(feedbackCreateSchema),
  );
  const feedbackResponse = registry.register(
    'FeedbackResponse',
    z.object({ data: z.object({ id: z.string().optional(), received: z.literal(true) }) }),
  );

  const projectListResponse = registry.register(
    'ProjectListResponse',
    z.object({
      data: z.array(projectSchema),
      meta: z.object({ count: z.number().int().nonnegative() }),
    }),
  );
  const projectItemResponse = registry.register(
    'ProjectItemResponse',
    z.object({ data: projectSchema }),
  );
  const goalListResponse = registry.register(
    'GoalListResponse',
    z.object({
      data: z.array(goalSchema),
      meta: z.object({ count: z.number().int().nonnegative() }),
    }),
  );
  const goalItemResponse = registry.register(
    'GoalItemResponse',
    z.object({ data: goalSchema }),
  );
  const historyListResponse = registry.register(
    'HistoryListResponse',
    z.object({
      data: z.array(historySchema),
      meta: z.object({ count: z.number().int().nonnegative() }),
    }),
  );
  const meItemResponse = registry.register('MeResponse', z.object({ data: meSchema }));

  const editorTokenScheme = registry.registerComponent('securitySchemes', 'EditorToken', {
    type: 'apiKey',
    in: 'header',
    name: 'x-editor-token',
    description: 'Shared bearer token for local + CI test environments only (S-02 gate).',
  });
  const accessJwtScheme = registry.registerComponent('securitySchemes', 'CloudflareAccessJWT', {
    type: 'apiKey',
    in: 'header',
    name: 'cf-access-jwt-assertion',
    description: 'JWT minted by Cloudflare Access on production hostnames.',
  });

  const editorAuth = [{ [editorTokenScheme.name]: [] }, { [accessJwtScheme.name]: [] }];
  const errorContent = { description: 'Error', content: jsonContent(errorSchema) };

  registry.registerPath({
    method: 'get',
    path: '/api/projects',
    summary: 'List projects',
    tags: ['projects'],
    request: { query: z.object({ includeArchived: includeArchivedQuery }) },
    responses: {
      200: { description: 'Project list', content: jsonContent(projectListResponse) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/projects',
    summary: 'Create a project',
    tags: ['projects'],
    security: editorAuth,
    request: { body: { content: jsonContent(projectSchema), required: true } },
    responses: {
      201: { description: 'Created', content: jsonContent(projectItemResponse) },
      400: errorContent,
      401: errorContent,
      403: errorContent,
      413: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/projects/{id}',
    summary: 'Get one project',
    tags: ['projects'],
    request: {
      params: z.object({ id: idParam }),
      query: z.object({ includeArchived: includeArchivedQuery }),
    },
    responses: {
      200: { description: 'Project', content: jsonContent(projectItemResponse) },
      404: errorContent,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/projects/{id}',
    summary: 'Update a project',
    tags: ['projects'],
    security: editorAuth,
    request: {
      params: z.object({ id: idParam }),
      body: { content: jsonContent(projectPatch), required: true },
    },
    responses: {
      200: { description: 'Updated', content: jsonContent(projectItemResponse) },
      400: errorContent,
      401: errorContent,
      403: errorContent,
      404: errorContent,
      413: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/projects/{id}',
    summary: 'Archive a project',
    tags: ['projects'],
    security: editorAuth,
    request: { params: z.object({ id: idParam }) },
    responses: {
      200: { description: 'Archived', content: jsonContent(projectItemResponse) },
      401: errorContent,
      403: errorContent,
      404: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/projects/{id}/restore',
    summary: 'Restore an archived project',
    tags: ['projects'],
    security: editorAuth,
    request: { params: z.object({ id: idParam }) },
    responses: {
      200: { description: 'Restored', content: jsonContent(projectItemResponse) },
      401: errorContent,
      403: errorContent,
      404: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/goals',
    summary: 'List goals',
    tags: ['goals'],
    request: { query: z.object({ includeArchived: includeArchivedQuery }) },
    responses: {
      200: { description: 'Goal list', content: jsonContent(goalListResponse) },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/goals',
    summary: 'Create a goal',
    tags: ['goals'],
    security: editorAuth,
    request: { body: { content: jsonContent(goalSchema), required: true } },
    responses: {
      201: { description: 'Created', content: jsonContent(goalItemResponse) },
      400: errorContent,
      401: errorContent,
      403: errorContent,
      413: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/goals/{id}',
    summary: 'Get one goal',
    tags: ['goals'],
    request: {
      params: z.object({ id: idParam }),
      query: z.object({ includeArchived: includeArchivedQuery }),
    },
    responses: {
      200: { description: 'Goal', content: jsonContent(goalItemResponse) },
      404: errorContent,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/goals/{id}',
    summary: 'Update a goal',
    tags: ['goals'],
    security: editorAuth,
    request: {
      params: z.object({ id: idParam }),
      body: { content: jsonContent(goalPatch), required: true },
    },
    responses: {
      200: { description: 'Updated', content: jsonContent(goalItemResponse) },
      400: errorContent,
      401: errorContent,
      403: errorContent,
      404: errorContent,
      413: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/goals/{id}',
    summary: 'Archive a goal',
    tags: ['goals'],
    security: editorAuth,
    request: { params: z.object({ id: idParam }) },
    responses: {
      200: { description: 'Archived', content: jsonContent(goalItemResponse) },
      401: errorContent,
      403: errorContent,
      404: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/goals/{id}/restore',
    summary: 'Restore an archived goal',
    tags: ['goals'],
    security: editorAuth,
    request: { params: z.object({ id: idParam }) },
    responses: {
      200: { description: 'Restored', content: jsonContent(goalItemResponse) },
      401: errorContent,
      403: errorContent,
      404: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/history',
    summary: 'List mutation history events',
    tags: ['history'],
    request: {
      query: z.object({
        entityType: z
          .union([z.literal('project'), z.literal('goal')])
          .optional()
          .openapi({ description: 'Filter by entity type.' }),
        entityId: z.string().optional().openapi({ description: 'Filter by entity id.' }),
        limit: z
          .string()
          .optional()
          .openapi({ description: 'Maximum events to return; defaults to 200.' }),
      }),
    },
    responses: {
      200: { description: 'History events', content: jsonContent(historyListResponse) },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/me',
    summary: 'Identity + display-name profile for the authenticated caller',
    tags: ['me'],
    security: editorAuth,
    responses: {
      200: { description: 'Profile', content: jsonContent(meItemResponse) },
      401: errorContent,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/feedback',
    summary: 'Submit visitor feedback',
    tags: ['feedback'],
    request: { body: { content: jsonContent(feedbackSchema), required: true } },
    responses: {
      201: { description: 'Received', content: jsonContent(feedbackResponse) },
      400: errorContent,
      413: errorContent,
      429: errorContent,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/me',
    summary: 'Upsert the caller display name',
    tags: ['me'],
    security: editorAuth,
    request: { body: { content: jsonContent(meUpdateSchema), required: true } },
    responses: {
      200: { description: 'Profile', content: jsonContent(meItemResponse) },
      400: errorContent,
      401: errorContent,
      413: errorContent,
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Metro ATL Transit Tracker — Content API',
      version: '1.0.0',
      description:
        'CRUD + history endpoints for projects and goals. Reads are public; writes require Cloudflare Access JWT (or a test-only editor token).',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'projects', description: 'Project resources.' },
      { name: 'goals', description: 'Goal resources.' },
      { name: 'history', description: 'Append-only mutation log.' },
      { name: 'me', description: 'Authenticated caller profile.' },
      { name: 'feedback', description: 'Public visitor feedback submissions.' },
    ],
  });
}
