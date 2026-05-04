import { makeItemHandlers } from '$lib/server/content/handlers';
import { goalStore } from '$lib/server/content/stores';

export const { GET, PATCH, DELETE } = makeItemHandlers(goalStore);
