import { makeRestoreHandler } from '$lib/server/content/handlers';
import { projectStore } from '$lib/server/content/stores';

export const { POST } = makeRestoreHandler(projectStore);
