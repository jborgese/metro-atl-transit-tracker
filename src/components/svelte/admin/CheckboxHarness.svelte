<script lang="ts">
  import { untrack } from 'svelte';
  import CheckboxGroup from './CheckboxGroup.svelte';

  interface Props {
    initial?: string[];
    hint?: string;
    error?: string;
    options?: Array<{ value: string; label: string }>;
    archivedOptions?: Array<{ value: string; label: string }>;
    archivedLabel?: string;
    registry?: { selected?: string[] };
  }

  let {
    initial = [],
    hint,
    error,
    options = [
      { value: '13121', label: 'Fulton' },
      { value: '13089', label: 'DeKalb' },
    ],
    archivedOptions,
    archivedLabel,
    registry = {},
  }: Props = $props();

  let selected = $state<string[]>(untrack(() => initial));

  $effect(() => {
    registry.selected = selected;
  });
</script>

<CheckboxGroup
  id="counties"
  legend="Counties"
  {hint}
  {error}
  {options}
  {archivedOptions}
  {archivedLabel}
  bind:selected
/>
