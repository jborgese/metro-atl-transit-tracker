<script lang="ts">
  import { untrack } from 'svelte';
  import { toFormDraft } from '#lib/content/formModel/draft.ts';
  import type { GoalDraft } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { Project, TimedAction } from '#types/content.ts';
  import GoalFields from './GoalFields.svelte';

  interface Props {
    initial?: Record<string, unknown>;
    projects?: Project[];
    actions?: TimedAction[];
    issues?: FieldIssue[];
    isNew?: boolean;
    archived?: boolean;
    readonly?: boolean;
    onchange?: (draft: GoalDraft) => void;
    onaddaction?: () => void;
  }

  let {
    initial = {},
    projects = [],
    actions = [],
    issues = [],
    isNew = false,
    archived = false,
    readonly = false,
    onchange,
    onaddaction = () => {},
  }: Props = $props();

  let draft = $state(untrack(() => toFormDraft('goal', initial)) as GoalDraft);

  $effect(() => {
    onchange?.($state.snapshot(draft) as GoalDraft);
  });
</script>

<GoalFields bind:draft {projects} {actions} {issues} {isNew} {archived} {readonly} {onaddaction} />
