<script lang="ts">
  import { untrack } from 'svelte';
  import RepeatableRows from './RepeatableRows.svelte';

  interface Row {
    key: string;
    label: string;
  }

  interface Props {
    initial?: string[];
    reorder?: boolean;
    hint?: string;
    itemName?: string;
    locked?: 'first' | 'all';
    registry?: { rows?: Row[] };
  }

  let {
    initial = [],
    reorder = false,
    hint,
    itemName = 'source',
    locked,
    registry = {},
  }: Props = $props();

  let counter = 0;
  const makeRow = (label = ''): Row => ({ key: `row-${counter++}`, label });

  let rows = $state<Row[]>(untrack(() => initial.map((label) => makeRow(label))));

  $effect(() => {
    registry.rows = rows;
  });
</script>

<RepeatableRows
  id="sources"
  legend="Sources"
  {itemName}
  {hint}
  {reorder}
  bind:rows
  makeRow={() => makeRow()}
>
  {#snippet row(item)}
    {#if locked !== undefined}
      <label>Locked <input disabled /></label>
    {/if}
    <label>Label <input bind:value={item.label} disabled={locked === 'all'} /></label>
  {/snippet}
</RepeatableRows>
