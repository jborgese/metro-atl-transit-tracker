import { makeRestoreHandler } from '#lib/server/content/handlers.ts';
import { timedActionStore } from '#lib/server/content/stores.ts';

export const { POST } = makeRestoreHandler(timedActionStore);
