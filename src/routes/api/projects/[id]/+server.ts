import { makeItemHandlers } from '$lib/server/content/handlers';
import { projectStore } from '$lib/server/content/stores';

export const { GET, PATCH, DELETE } = makeItemHandlers(projectStore);
