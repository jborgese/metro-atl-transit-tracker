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
    registry?: { rows?: Row[] };
  }

  let { initial = [], reorder = false, hint, registry = {} }: Props = $props();

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
  itemName="source"
  {hint}
  {reorder}
  bind:rows
  makeRow={() => makeRow()}
>
  {#snippet row(item)}
    <label>Label <input bind:value={item.label} /></label>
  {/snippet}
</RepeatableRows>
