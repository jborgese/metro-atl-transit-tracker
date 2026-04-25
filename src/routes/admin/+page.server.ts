import type { PageServerLoad } from './$types';
import { requireEditorActor } from '$lib/server/auth/editor';

export const load: PageServerLoad = async (event) => {
  await requireEditorActor(event, 'content:edit');
};
