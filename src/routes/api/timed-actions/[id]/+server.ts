import { makeItemHandlers } from '#lib/server/content/handlers.ts';
import { timedActionStore } from '#lib/server/content/stores.ts';

export const { GET, PATCH, DELETE } = makeItemHandlers(timedActionStore);
