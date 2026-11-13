import { makeRestoreHandler } from '#lib/server/content/handlers.ts';
import { goalStore } from '#lib/server/content/stores.ts';

export const { POST } = makeRestoreHandler(goalStore);
