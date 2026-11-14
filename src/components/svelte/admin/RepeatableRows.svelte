<script lang="ts" generics="T extends { key: string }">
  import { tick, type Snippet } from 'svelte';

  interface Props {
    id: string;
    legend: string;
    hint?: string;
    itemName: string;
    rows?: T[];
    makeRow: () => T;
    reorder?: boolean;
    row: Snippet<[T, number]>;
  }

  let {
    id,
    legend,
    hint,
    itemName,
    rows = $bindable([]),
    makeRow,
    reorder = false,
    row,
  }: Props = $props();

  let list: HTMLElement | undefined = $state();
  let addButton: HTMLButtonElement | undefined = $state();
  let announcement = $state('');

  const hintId = $derived(`${id}-hint`);
  const itemTitle = $derived(itemName.charAt(0).toUpperCase() + itemName.slice(1));
  const article = $derived(/^[aeiou]/i.test(itemName) ? 'an' : 'a');

  function rowFieldset(index: number) {
    return list?.querySelectorAll<HTMLElement>(':scope > .row')[index];
  }

  async function add() {
    rows = [...rows, makeRow()];
    await tick();
    const fieldset = rowFieldset(rows.length - 1);
    const controls = fieldset?.querySelectorAll<HTMLElement>(
      '.row-body :is(input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]))',
    );
    const control = [...(controls ?? [])].find((element) => !element.matches(':disabled'));
    (control ?? fieldset)?.focus();
  }

  async function clearAnnouncement() {
    announcement = '';
    await tick();
  }

  async function remove(index: number) {
    rows = rows.filter((_, position) => position !== index);
    const left = rows.length;
    await clearAnnouncement();
    if (left === 0) {
      addButton?.focus();
    } else {
      rowFieldset(Math.max(index - 1, 0))?.focus();
    }
    announcement = `${itemTitle} ${index + 1} removed. ${left} ${left === 1 ? itemName : `${itemName}s`} left.`;
  }

  async function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    const current = rows[index];
    const neighbor = rows[target];
    if (current === undefined || neighbor === undefined) {
      return;
    }
    const next = [...rows];
    next[index] = neighbor;
    next[target] = current;
    rows = next;
    await clearAnnouncement();
    rowFieldset(target)?.focus();
    announcement = `${itemTitle} ${index + 1} moved ${offset === -1 ? 'up' : 'down'}.`;
  }
</script>

<fieldset {id} class="rows" aria-describedby={hint ? hintId : undefined}>
  <legend>{legend}</legend>
  {#if hint}
    <p class="hint" id={hintId}>{hint}</p>
  {/if}
  {#if rows.length === 0}
    <p class="empty">No {itemName}s yet.</p>
  {/if}
  <div class="list" bind:this={list}>
    {#each rows as item, index (item.key)}
      <fieldset class="row" tabindex="-1">
        <legend>{itemTitle} {index + 1}</legend>
        <div class="row-body">
          {@render row(item, index)}
        </div>
        <div class="buttons">
          {#if reorder && index > 0}
            <button type="button" onclick={() => move(index, -1)}>
              Move {itemName}
              {index + 1} up
            </button>
          {/if}
          {#if reorder && index < rows.length - 1}
            <button type="button" onclick={() => move(index, 1)}>
              Move {itemName}
              {index + 1} down
            </button>
          {/if}
          <button type="button" onclick={() => remove(index)}>
            Remove {itemName}
            {index + 1}
          </button>
        </div>
      </fieldset>
    {/each}
  </div>
  <div class="add">
    <button type="button" bind:this={addButton} onclick={add}>
      {rows.length === 0 ? `Add ${article} ${itemName}` : `Add another ${itemName}`}
    </button>
  </div>
  <p class="visually-hidden" role="status">{announcement}</p>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--surface-1);
  }

  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  legend {
    padding: 0 0.3rem;
    font-size: 0.86rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 0.8rem;
  }

  .hint,
  .empty {
    color: var(--text-muted);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  button {
    min-height: 2rem;
    border: 1px solid var(--field-border);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: inherit;
    font: inherit;
    font-size: 0.86rem;
    padding: 0.3rem 0.75rem;
    cursor: pointer;
  }

  button:focus-visible,
  .row:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
