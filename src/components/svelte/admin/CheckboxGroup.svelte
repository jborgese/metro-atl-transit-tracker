<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    id: string;
    legend: string;
    hint?: string;
    error?: string;
    options: Array<{ value: string; label: string }>;
    selected?: string[];
  }

  let { id, legend, hint, error, options, selected = $bindable([]) }: Props = $props();

  const unknown = untrack(() => [
    ...new Set(selected.filter((value) => !options.some((option) => option.value === value))),
  ]);

  const hintId = $derived(`${id}-hint`);
  const errorId = $derived(`${id}-error`);
  const describedBy = $derived(
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
  );
  const entries = $derived([
    ...options,
    ...unknown.map((value) => ({ value, label: `${value} (not in the list)` })),
  ]);

  function toggle(value: string, checked: boolean) {
    selected = checked ? [...selected, value] : selected.filter((current) => current !== value);
  }
</script>

<fieldset {id} class:has-error={Boolean(error)} aria-describedby={describedBy}>
  <legend>{legend}</legend>
  {#if hint}
    <p class="hint" id={hintId}>{hint}</p>
  {/if}
  {#if error}
    <p class="error" id={errorId}>Error: {error}</p>
  {/if}
  <div class="options">
    {#each entries as entry, index (index)}
      <div class="option">
        <input
          type="checkbox"
          id={`${id}-${index}`}
          checked={selected.includes(entry.value)}
          onchange={(event) => toggle(entry.value, event.currentTarget.checked)}
        />
        <label for={`${id}-${index}`}>{entry.label}</label>
      </div>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
  }

  fieldset.has-error {
    border-color: var(--danger-text);
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

  .hint {
    color: var(--text-muted);
  }

  .error {
    border-left: 3px solid var(--atl-red);
    padding-left: 0.5rem;
    color: var(--danger-text);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2rem;
  }

  label {
    font-size: 0.9rem;
  }

  input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
