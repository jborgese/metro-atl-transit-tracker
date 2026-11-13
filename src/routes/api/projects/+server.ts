import { makeCollectionHandlers } from '#lib/server/content/handlers.ts';
import { projectStore } from '#lib/server/content/stores.ts';

export const { GET, POST } = makeCollectionHandlers(projectStore);
