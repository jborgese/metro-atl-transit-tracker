<script lang="ts">
  import { untrack } from 'svelte';
  import { fromJsonText, toJsonText, type JsonResult } from '#lib/content/formModel/json.ts';
  import type { FormDraft } from '#lib/content/formModel/types.ts';

  interface Props {
    id: string;
    draft: FormDraft;
    stored: FormDraft;
    readonly: boolean;
    onedit: (result: JsonResult) => void;
  }

  let { id, draft, stored, readonly, onedit }: Props = $props();

  const uid = $props.id();
  const noteId = `${uid}-note`;

  let text = $state(untrack(() => toJsonText(draft)));
  const result = $derived(fromJsonText(stored, text));
  const unknownKeys = $derived(result.ok ? result.unknownKeys : []);
  const hasNote = $derived(!result.ok || unknownKeys.length > 0);

  function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
    text = event.currentTarget.value;
    onedit(result);
  }

  function format() {
    if (result.ok) {
      text = toJsonText(result.draft);
    }
  }
</script>

<div class="json-head">
  <label for={id}>Record as JSON</label>
  <button type="button" onclick={format} disabled={readonly}>Format JSON</button>
</div>
<textarea
  {id}
  value={text}
  spellcheck="false"
  {readonly}
  aria-invalid={result.ok ? undefined : 'true'}
  aria-describedby={hasNote ? noteId : undefined}
  oninput={handleInput}></textarea>
{#if !result.ok}
  <p class="note error" id={noteId}>{result.error}</p>
{:else if unknownKeys.length > 0}
  <p class="note" id={noteId}>
    {unknownKeys.join(', ')} will be stored but shown nowhere, and cannot be removed later.
  </p>
{/if}

<style>
  .json-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  label {
    font-size: 0.86rem;
    color: var(--text-muted);
  }

  button,
  textarea {
    font: inherit;
  }

  button {
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  textarea {
    min-height: 24rem;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--field-border);
    border-radius: 0.5rem;
    background: var(--surface-1);
    color: inherit;
    font-family: var(--font-mono);
    font-size: max(0.84rem, 16px);
    line-height: 1.5;
    padding: 0.65rem;
  }

  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--action-accent);
  }

  .note.error {
    color: var(--danger-text);
    border-left: 3px solid var(--atl-red);
    padding-left: 0.5rem;
  }

  @media (max-width: 700px) {
    textarea {
      min-height: 16rem;
    }
  }

  @media (max-height: 640px) {
    textarea {
      min-height: 14rem;
    }
  }

  @media (pointer: coarse) {
    button {
      min-height: 2.75rem;
      padding-block: 0.55rem;
    }
  }
</style>
