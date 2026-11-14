<script lang="ts">
  import { untrack } from 'svelte';
  import { toFormDraft } from '#lib/content/formModel/draft.ts';
  import type { TimedActionDraft } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { Goal } from '#types/content.ts';
  import TimedActionFields from './TimedActionFields.svelte';

  interface Props {
    initial?: Record<string, unknown>;
    goals: Goal[];
    issues?: FieldIssue[];
    today?: string;
    readonly?: boolean;
    onchange?: (draft: TimedActionDraft) => void;
  }

  let {
    initial = {},
    goals,
    issues = [],
    today = '2026-11-14',
    readonly = false,
    onchange,
  }: Props = $props();

  let draft = $state(untrack(() => toFormDraft('timed_action', initial)) as TimedActionDraft);

  $effect(() => {
    onchange?.($state.snapshot(draft) as TimedActionDraft);
  });
</script>

<TimedActionFields bind:draft {goals} {issues} {today} {readonly} />
