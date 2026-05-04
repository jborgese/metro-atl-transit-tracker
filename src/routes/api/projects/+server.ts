import { makeCollectionHandlers } from '$lib/server/content/handlers';
import { projectStore } from '$lib/server/content/stores';

export const { GET, POST } = makeCollectionHandlers(projectStore);
