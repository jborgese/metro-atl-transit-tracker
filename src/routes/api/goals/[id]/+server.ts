import { makeItemHandlers } from '#lib/server/content/handlers.ts';
import { goalStore } from '#lib/server/content/stores.ts';

export const { GET, PATCH, DELETE } = makeItemHandlers(goalStore);
