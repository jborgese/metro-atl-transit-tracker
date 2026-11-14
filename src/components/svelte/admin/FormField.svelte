<script lang="ts">
  import { untrack, type Snippet } from 'svelte';

  interface Props {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    limit?: number;
    value?: string;
    children: Snippet<[{ describedBy: string | undefined; invalid: boolean }]>;
  }

  const ANNOUNCE_DELAY_MS = 1000;

  let { id, label, hint, error, required, limit, value = '', children }: Props = $props();

  const hintId = $derived(`${id}-hint`);
  const errorId = $derived(`${id}-error`);
  const describedBy = $derived(
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
  );
  const remaining = $derived(limit === undefined ? 0 : limit - value.trim().length);
  const counter = $derived.by(() => {
    if (limit === undefined) {
      return null;
    }
    const count = Math.abs(remaining);
    const noun = count === 1 ? 'character' : 'characters';
    return remaining >= 0
      ? `You have ${count} ${noun} remaining`
      : `You have ${count} ${noun} too many`;
  });

  let announced = $state(untrack(() => counter));

  $effect(() => {
    const text = counter;
    if (text === untrack(() => announced)) {
      return;
    }
    const timer = setTimeout(() => {
      announced = text;
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  });
</script>

<div class="field">
  <label for={id}>{required ? `${label} (required)` : label}</label>
  {#if hint}
    <p class="hint" id={hintId}>{hint}</p>
  {/if}
  {#if error}
    <p class="error" id={errorId}><span class="visually-hidden">Error:</span> {error}</p>
  {/if}
  {@render children({ describedBy, invalid: Boolean(error) })}
  {#if counter !== null}
    <p class="counter" class:over={remaining < 0}>{counter}</p>
    <p class="visually-hidden" aria-live="polite">{announced}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  label {
    font-size: 0.86rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 0.8rem;
  }

  .hint,
  .counter {
    color: var(--text-muted);
  }

  .error,
  .counter.over {
    color: var(--danger-text);
  }

  .error {
    border-left: 3px solid var(--atl-red);
    padding-left: 0.5rem;
  }

  .field :global(input),
  .field :global(textarea),
  .field :global(select) {
    border: 1px solid var(--field-border);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: inherit;
    font: inherit;
    padding: 0.5rem 0.65rem;
  }

  .field :global(input:focus-visible),
  .field :global(textarea:focus-visible),
  .field :global(select:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .field :global([aria-invalid='true']) {
    border-color: var(--danger-text);
  }
</style>
