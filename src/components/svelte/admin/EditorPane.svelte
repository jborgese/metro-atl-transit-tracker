<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import {
    emptyRecord,
    pruneBlankRows,
    toFormDraft,
    toRecord,
  } from '#lib/content/formModel/draft.ts';
  import { toJsonText, type JsonResult } from '#lib/content/formModel/json.ts';
  import { fieldLabel } from '#lib/content/formModel/labels.ts';
  import { toPayload, type WriteMode } from '#lib/content/formModel/payload.ts';
  import type { ContentKind, ContentRecord } from '#lib/content/formModel/types.ts';
  import { validatePayload, type FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { Goal, Project } from '#types/content.ts';
  import { atlantaDate } from '#utils/timedActions.ts';
  import JsonView from './JsonView.svelte';

  interface Props {
    kind: ContentKind;
    title: string;
    record: ContentRecord | null;
    goals: Goal[];
    projects: Project[];
    existingIds: string[];
    saving: boolean;
    loading: boolean;
    serverIssue: FieldIssue | null;
    meta?: Snippet;
    onsave: (request: { mode: WriteMode; body: Record<string, unknown> }) => void;
    onnochanges: () => void;
    onarchive: () => void;
    onrestore: () => void;
    onclose: () => void;
  }

  let {
    kind,
    title,
    record,
    goals,
    existingIds,
    saving,
    loading,
    serverIssue,
    meta,
    onsave,
    onnochanges,
    onarchive,
    onrestore,
    onclose,
  }: Props = $props();

  const loaded = $state.raw(untrack(() => record));
  const stored = untrack(() => toFormDraft(kind, record ?? emptyRecord(kind)));
  let draft = $state(toFormDraft(stored.kind, stored.base));
  let jsonError = $state('');
  let issues: FieldIssue[] = $state([]);
  let dismissedIssue: FieldIssue | null = $state(null);
  let heading: HTMLHeadingElement | undefined = $state();

  const mode: WriteMode = $derived(loaded === null ? 'create' : 'update');
  const next = $derived(toRecord(draft));
  const payload = $derived(toPayload(kind, mode, next, loaded ?? emptyRecord(kind)));
  const dirty = $derived(payload.changed || jsonError !== '');
  const archived = $derived(loaded?.is_archived === true);
  const shownServerIssue = $derived(serverIssue === dismissedIssue ? null : serverIssue);
  const summary = $derived([
    ...issues.map((issue) => ({ key: `issue:${issue.path}`, message: issue.message })),
    ...(shownServerIssue === null
      ? []
      : [{ key: 'server', message: describeServerIssue(shownServerIssue) }]),
  ]);

  export function isDirty(): boolean {
    return dirty;
  }

  export function draftText(): string {
    return toJsonText(draft);
  }

  export function focusHeading() {
    heading?.focus();
  }

  function describeServerIssue(issue: FieldIssue): string {
    const label = fieldLabel(kind, issue.path);
    return label === issue.path ? issue.message : `${label}: ${issue.message}`;
  }

  function applyJson(result: JsonResult) {
    dismissedIssue = serverIssue;
    jsonError = result.ok ? '' : result.error;
    if (result.ok) {
      draft = result.draft;
    }
  }

  function save() {
    dismissedIssue = serverIssue;
    issues = [];
    if (jsonError !== '') {
      issues = [{ path: '', message: jsonError }];
      return;
    }
    draft = pruneBlankRows(draft);
    const request = toPayload(kind, mode, toRecord(draft), loaded);
    if (!request.changed) {
      onnochanges();
      return;
    }
    const found = validatePayload(kind, mode, request.body, {
      today: atlantaDate(new Date()),
      goals,
      existingIds,
      loaded,
    });
    if (found.length > 0) {
      issues = found;
      return;
    }
    onsave({ mode, body: request.body });
  }
</script>

<div class="editor-head">
  <h2 bind:this={heading} tabindex="-1">
    {loaded === null ? `New ${title}` : `Editing ${title} ${String(loaded.id)}`}
  </h2>
  {#if loaded !== null}
    <button class="ghost" onclick={onclose} disabled={loading} aria-label="Close editor">
      Close
    </button>
  {/if}
</div>

{@render meta?.()}

<JsonView {draft} {stored} readonly={saving || loading} onedit={applyJson} />

{#each payload.removedKeys as key (key)}
  <p class="editor-state warning">
    {key} can't be removed through the API; it will keep its stored value.
  </p>
{/each}

{#if jsonError === ''}
  {#if dirty}
    <p class="editor-state warning">Unsaved changes.</p>
  {:else if loaded !== null}
    <p class="editor-state">Saved.</p>
  {/if}
{/if}

{#if summary.length > 0}
  <div class="summary" role="alert">
    <h3>There is a problem</h3>
    <ul>
      {#each summary as item (item.key)}
        <li>{item.message}</li>
      {/each}
    </ul>
  </div>
{/if}

<div class="editor-actions">
  <button class="primary" onclick={save}>
    {saving ? 'Saving…' : loaded === null ? `Create ${title}` : 'Save Changes'}
  </button>
  <button onclick={onarchive} disabled={loading || loaded === null || archived}>Archive</button>
  <button onclick={onrestore} disabled={loading || loaded === null || !archived}>Restore</button>
</div>

<style>
  .editor-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    word-break: break-word;
  }

  button {
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }

  .ghost {
    flex-shrink: 0;
    border-color: transparent;
    color: var(--text-muted);
  }

  .ghost:hover:not(:disabled) {
    color: inherit;
    border-color: var(--border-subtle);
  }

  .editor-state {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .editor-state.warning {
    color: var(--action-accent);
  }

  .summary {
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--atl-red);
    border-radius: 0.5rem;
    background: var(--surface-1);
  }

  .summary h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }

  .summary ul {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.86rem;
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.65rem;
    row-gap: 0.55rem;
    margin-top: 0.15rem;
  }

  .primary {
    border-color: var(--atl-blue);
    background: var(--surface-1);
  }

  @media (pointer: coarse) {
    button {
      min-height: 2.75rem;
      padding-block: 0.55rem;
    }
  }
</style>
