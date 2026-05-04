import { makeRestoreHandler } from '$lib/server/content/handlers';
import { goalStore } from '$lib/server/content/stores';

export const { POST } = makeRestoreHandler(goalStore);
