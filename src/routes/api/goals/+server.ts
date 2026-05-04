import { makeCollectionHandlers } from '$lib/server/content/handlers';
import { goalStore } from '$lib/server/content/stores';

export const { GET, POST } = makeCollectionHandlers(goalStore);
