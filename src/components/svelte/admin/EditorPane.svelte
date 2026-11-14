<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import {
    emptyRecord,
    pruneBlankRows,
    toFormDraft,
    toRecord,
  } from '#lib/content/formModel/draft.ts';
  import { toJsonText, type JsonResult } from '#lib/content/formModel/json.ts';
  import { currentIssues } from '#lib/content/formModel/issues.ts';
  import { fieldId, fieldLabel } from '#lib/content/formModel/labels.ts';
  import { toPayload, type WriteMode } from '#lib/content/formModel/payload.ts';
  import type {
    ContentKind,
    ContentRecord,
    TimedActionDraft,
  } from '#lib/content/formModel/types.ts';
  import { validatePayload, type FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { Goal, Project } from '#types/content.ts';
  import { atlantaDate } from '#utils/timedActions.ts';
  import ErrorSummary from './ErrorSummary.svelte';
  import JsonView from './JsonView.svelte';
  import TimedActionFields from './TimedActionFields.svelte';

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
    prefersJson?: boolean;
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
    prefersJson = $bindable(false),
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
  let reportedPaths: string[] = $state.raw([]);
  let sent: ContentRecord | null = $state.raw(null);
  let dismissedIssue: FieldIssue | null = $state(null);
  let errorSummary: ErrorSummary | undefined = $state();
  let heading: HTMLHeadingElement | undefined = $state();

  const mode: WriteMode = $derived(loaded === null ? 'create' : 'update');
  const next = $derived(toRecord(draft));
  const payload = $derived(toPayload(kind, mode, next, loaded ?? emptyRecord(kind)));
  const dirty = $derived(payload.changed || jsonError !== '');
  const archived = $derived(loaded?.is_archived === true);
  const jsonId = $derived(fieldId(kind, 'json'));
  const hasForm = $derived(kind === 'timed_action');
  const showJson = $derived(!hasForm || prefersJson);
  const today = atlantaDate(new Date());
  const validationIssues = $derived.by(() => {
    if (reportedPaths.length === 0) {
      return [];
    }
    const attempted = toRecord(pruneBlankRows(draft));
    const request = toPayload(kind, mode, attempted, loaded);
    return validatePayload(kind, mode, request.body, {
      today,
      goals,
      existingIds,
      loaded,
    }).filter((issue) => reportedPaths.includes(issue.path));
  });
  const shownServerIssue = $derived(
    serverIssue === null ||
      serverIssue === dismissedIssue ||
      currentIssues([serverIssue], sent ?? next, next).length === 0
      ? null
      : serverIssue,
  );
  const fieldIssues: FieldIssue[] = $derived(
    jsonError !== ''
      ? []
      : [
          ...validationIssues,
          ...(shownServerIssue === null
            ? []
            : [
                {
                  path: shownServerIssue.path,
                  message: describeServerIssue(shownServerIssue),
                },
              ]),
        ],
  );
  const summaryIssues = $derived(
    jsonError !== ''
      ? [{ path: '', message: jsonError, href: `#${jsonId}` }]
      : fieldIssues.map((issue) => ({
          ...issue,
          href: `#${showJson ? jsonId : fieldId(kind, issue.path)}`,
        })),
  );
  const hasProblems = $derived(summaryIssues.length > 0);

  $effect(() => {
    if (!hasProblems) {
      return;
    }
    const normal = document.title.replace(/^Error: /, '');
    document.title = `Error: ${normal}`;
    return () => {
      document.title = normal;
    };
  });

  $effect(() => {
    if (serverIssue !== null && serverIssue !== untrack(() => dismissedIssue)) {
      void focusSummary();
    }
  });

  export function isDirty(): boolean {
    return dirty;
  }

  export function draftText(): string {
    return toJsonText(draft);
  }

  export function focusHeading() {
    heading?.focus();
  }

  async function focusSummary() {
    await tick();
    errorSummary?.focus();
  }

  function describeServerIssue(issue: FieldIssue): string {
    const label = fieldLabel(kind, issue.path);
    return label === issue.path ? issue.message : `${label}: ${issue.message}`;
  }

  function applyJson(result: JsonResult) {
    jsonError = result.ok ? '' : result.error;
    if (result.ok) {
      draft = result.draft;
    }
  }

  function switchView() {
    if (prefersJson && jsonError !== '') {
      return;
    }
    prefersJson = !prefersJson;
  }

  function save() {
    dismissedIssue = serverIssue;
    reportedPaths = [];
    sent = null;
    if (jsonError !== '') {
      void focusSummary();
      return;
    }
    draft = pruneBlankRows(draft);
    const attempted = toRecord(draft);
    const request = toPayload(kind, mode, attempted, loaded);
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
      reportedPaths = found.map((issue) => issue.path);
      void focusSummary();
      return;
    }
    sent = attempted;
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

{#if hasForm}
  <div class="view-switch">
    <button type="button" onclick={switchView}>
      {prefersJson ? 'Back to form' : 'Edit as JSON (advanced)'}
    </button>
  </div>
{/if}

{#if showJson}
  <JsonView id={jsonId} {draft} {stored} readonly={saving || loading} onedit={applyJson} />
{:else}
  <TimedActionFields
    bind:draft={() => draft as TimedActionDraft, (value) => (draft = value)}
    {goals}
    issues={fieldIssues}
    {today}
    readonly={saving || loading}
  />
{/if}

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

<ErrorSummary bind:this={errorSummary} issues={summaryIssues} />

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
    outline: 2px solid var(--focus-ring);
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
