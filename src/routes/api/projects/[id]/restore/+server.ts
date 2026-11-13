import { makeRestoreHandler } from '#lib/server/content/handlers.ts';
import { projectStore } from '#lib/server/content/stores.ts';

export const { POST } = makeRestoreHandler(projectStore);
