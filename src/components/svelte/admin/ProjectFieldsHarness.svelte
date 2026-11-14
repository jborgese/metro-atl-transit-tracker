<script lang="ts">
  import { untrack } from 'svelte';
  import { toFormDraft } from '#lib/content/formModel/draft.ts';
  import type { ProjectDraft } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import ProjectFields from './ProjectFields.svelte';

  interface Props {
    initial?: Record<string, unknown>;
    issues?: FieldIssue[];
    isNew?: boolean;
    hasStoredLeadOrg?: boolean;
    hasStoredScope?: boolean;
    readonly?: boolean;
    onchange?: (draft: ProjectDraft) => void;
  }

  let {
    initial = {},
    issues = [],
    isNew = false,
    hasStoredLeadOrg = false,
    hasStoredScope = false,
    readonly = false,
    onchange,
  }: Props = $props();

  let draft = $state(untrack(() => toFormDraft('project', initial)) as ProjectDraft);

  $effect(() => {
    onchange?.($state.snapshot(draft) as ProjectDraft);
  });
</script>

<ProjectFields bind:draft {issues} {isNew} {hasStoredLeadOrg} {hasStoredScope} {readonly} />
