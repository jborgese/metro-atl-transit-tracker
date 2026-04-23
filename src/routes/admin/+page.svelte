<script lang="ts">
  import { onMount } from 'svelte';
  import BaseLayout from '../../layouts/BaseLayout.svelte';
  import type { ContentHistoryEvent, Goal, Project } from '@/types/content';

  type EditorEntity = 'project' | 'goal';
  type EntityItem = Project | Goal;
  type MessageKind = 'info' | 'success' | 'error';

  let token = '';
  let actor = 'admin';
  let dataset: EditorEntity = 'project';
  let selectedDataset: EditorEntity = 'project';
  let projects: Project[] = [];
  let goals: Goal[] = [];
  let history: ContentHistoryEvent[] = [];
  let selectedId = '';
  let editorJson = '';
  let searchQuery = '';
  let includeArchived = true;
  let loading = false;
  let message = '';
  let messageKind: MessageKind = 'info';
  let dirty = false;
  let editorError = '';
  let lastLoadedAt = '';
  let now = Date.now();

  let activeItems: EntityItem[] = [];
  let filteredItems: EntityItem[] = [];
  let selectedEntity: EntityItem | null = null;
  let selectedArchived = false;
  let searchTerm = '';

  const entityTitle: Record<EditorEntity, string> = {
    project: 'Project',
    goal: 'Goal',
  };

  const newProjectTemplate: Project = {
    id: '',
    title: '',
    summary: '',
    status: 'planning',
    modes: [],
    related_counties: [],
    sources: [],
  };

  const newGoalTemplate: Goal = {
    id: '',
    goal: '',
    actions: '',
    related_project_ids: [],
    related_counties: [],
    related_orgs: [],
  };

  $: activeItems = dataset === 'project' ? projects : goals;
  $: searchTerm = searchQuery.trim().toLowerCase();
  $: filteredItems = activeItems.filter((item) => {
    if (!includeArchived && item.is_archived === true) {
      return false;
    }
    if (!searchTerm) {
      return true;
    }

    const haystack = `${item.id} ${toEntityHeadline(item, dataset)} ${toEntitySubline(item, dataset)}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
  $: selectedEntity = selectedId
    ? (selectedDataset === 'project' ? projects : goals).find((item) => item.id === selectedId) ?? null
    : null;
  $: selectedArchived = selectedEntity?.is_archived === true;

  function authHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token.trim().length > 0) {
      headers['x-editor-token'] = token.trim();
    }
    if (actor.trim().length > 0) {
      headers['x-editor-actor'] = actor.trim();
    }
    return headers;
  }

  function setMessage(next: string, kind: MessageKind) {
    message = next;
    messageKind = kind;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  async function toResponseErrorMessage(url: string, res: Response) {
    const raw = (await res.text()).trim();
    if (!raw) {
      return `${url} returned ${res.status}`;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const messageCandidate = parsed.message;
      if (typeof messageCandidate === 'string' && messageCandidate.trim().length > 0) {
        return `${url} returned ${res.status}: ${messageCandidate.trim()}`;
      }
    } catch {
      // ignore parse failures and keep raw body
    }

    return `${url} returned ${res.status}: ${raw}`;
  }

  async function fetchCollection<T>(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(await toResponseErrorMessage(url, res));
    }

    const payload = await res.json();
    if (Array.isArray(payload)) {
      return payload as T[];
    }
    if (payload && Array.isArray(payload.data)) {
      return payload.data as T[];
    }
    return [] as T[];
  }

  function setEditorFromEntity(entity: EntityItem) {
    editorJson = `${JSON.stringify(entity, null, 2)}\n`;
    dirty = false;
    validateEditorJson();
  }

  function startNew(mode: EditorEntity) {
    dataset = mode;
    selectedDataset = mode;
    selectedId = '';
    const template = mode === 'project' ? newProjectTemplate : newGoalTemplate;
    editorJson = `${JSON.stringify(template, null, 2)}\n`;
    dirty = false;
    validateEditorJson();
  }

  function setDataset(kind: EditorEntity) {
    if (dataset === kind) {
      return;
    }
    dataset = kind;
    searchQuery = '';
  }

  function selectEntity(id: string, kind: EditorEntity) {
    const items = kind === 'project' ? projects : goals;
    const entity = items.find((item) => item.id === id);
    if (!entity) {
      setMessage(`Could not find ${kind} ${id}`, 'error');
      return;
    }
    dataset = kind;
    selectedDataset = kind;
    selectedId = id;
    setEditorFromEntity(entity);
  }

  function closeEditor() {
    if (dirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    startNew(dataset);
  }

  function toEntityHeadline(item: EntityItem, kind: EditorEntity) {
    if (kind === 'project') {
      const project = item as Project;
      return project.title?.trim() || project.id;
    }
    const goal = item as Goal;
    return goal.goal?.trim() || goal.id;
  }

  function toEntitySubline(item: EntityItem, kind: EditorEntity) {
    if (kind === 'project') {
      const project = item as Project;
      return project.status?.trim() || 'status unknown';
    }
    const goal = item as Goal;
    const relatedCount = Array.isArray(goal.related_project_ids) ? goal.related_project_ids.length : 0;
    return `${relatedCount} related projects`;
  }

  function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function formatRelative(value: string, reference = now) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const diff = reference - date.getTime();
    const absDiff = Math.abs(diff);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (absDiff < 45_000) return 'just now';
    if (absDiff < hour) return `${Math.round(absDiff / minute)} min ago`;
    if (absDiff < day) return `${Math.round(absDiff / hour)} hr ago`;
    if (absDiff < 7 * day) return `${Math.round(absDiff / day)} day${Math.round(absDiff / day) === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString();
  }

  function validateEditorJson() {
    try {
      const parsed = JSON.parse(editorJson);
      if (!isRecord(parsed)) {
        editorError = 'Top-level JSON value must be an object.';
        return null;
      }
      editorError = '';
      return parsed;
    } catch (err) {
      editorError = err instanceof Error ? err.message : 'Invalid JSON';
      return null;
    }
  }

  function handleEditorInput() {
    dirty = true;
    validateEditorJson();
  }

  function formatEditorJson() {
    const parsed = validateEditorJson();
    if (!parsed) {
      setMessage('Fix JSON errors before formatting.', 'error');
      return;
    }
    editorJson = `${JSON.stringify(parsed, null, 2)}\n`;
    dirty = true;
    editorError = '';
  }

  async function loadData(options: { quiet?: boolean } = {}) {
    loading = true;
    const previousSelection = selectedId;
    const previousSelectedDataset = selectedDataset;

    try {
      const [projectData, goalData, historyData] = await Promise.all([
        fetchCollection<Project>('/api/projects?includeArchived=true'),
        fetchCollection<Goal>('/api/goals?includeArchived=true'),
        fetchCollection<ContentHistoryEvent>('/api/history?limit=100'),
      ]);

      projects = projectData;
      goals = goalData;
      history = historyData;
      lastLoadedAt = new Date().toISOString();
      now = Date.now();

      if (previousSelection) {
        const exists =
          previousSelectedDataset === 'project'
            ? projectData.some((item) => item.id === previousSelection)
            : goalData.some((item) => item.id === previousSelection);
        if (exists) {
          selectEntity(previousSelection, previousSelectedDataset);
        } else {
          startNew(dataset);
        }
      } else if (!selectedId) {
        startNew(dataset);
      }

      if (!options.quiet) {
        setMessage('Loaded latest content.', 'success');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load content.', 'error');
    } finally {
      loading = false;
    }
  }

  async function saveEntity() {
    const parsed = validateEditorJson();
    if (!parsed) {
      setMessage('Editor JSON is invalid. Fix formatting and try again.', 'error');
      return;
    }

    const isCreate = selectedId.length === 0;
    const targetDataset: EditorEntity = isCreate ? dataset : selectedDataset;

    if (isCreate) {
      const candidateId = parsed.id;
      if (typeof candidateId !== 'string' || candidateId.trim().length === 0) {
        setMessage(`New ${targetDataset}s must include a non-empty "id".`, 'error');
        return;
      }
    }

    const base = targetDataset === 'project' ? '/api/projects' : '/api/goals';
    const endpoint = isCreate ? base : `${base}/${encodeURIComponent(selectedId)}`;
    const method = isCreate ? 'POST' : 'PATCH';

    const body = { ...parsed };
    delete body.is_archived;
    delete body.archived_at;
    delete body.archived_by;

    loading = true;
    try {
      const res = await fetch(endpoint, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(await toResponseErrorMessage(endpoint, res));
      }

      const payload = (await res.json()) as Record<string, unknown>;
      const data = isRecord(payload.data) ? payload.data : null;
      const savedId = typeof data?.id === 'string' ? data.id : selectedId;

      await loadData({ quiet: true });
      if (savedId) {
        selectEntity(savedId, targetDataset);
      }
      dirty = false;
      setMessage(
        isCreate ? `Created ${targetDataset} ${savedId}.` : `Updated ${targetDataset} ${savedId}.`,
        'success',
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      loading = false;
    }
  }

  async function archiveSelected() {
    if (!selectedId) {
      setMessage('Select an item to archive.', 'error');
      return;
    }

    if (selectedArchived) {
      setMessage(`${entityTitle[selectedDataset]} ${selectedId} is already archived.`, 'info');
      return;
    }

    const targetDataset = selectedDataset;
    const targetId = selectedId;
    const proceed = window.confirm(`Archive ${entityTitle[targetDataset].toLowerCase()} ${targetId}?`);
    if (!proceed) {
      return;
    }

    const base = targetDataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const endpoint = `${base}/${encodeURIComponent(targetId)}`;
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage(endpoint, res));
      }
      await loadData({ quiet: true });
      selectEntity(targetId, targetDataset);
      dirty = false;
      setMessage(`Archived ${targetDataset} ${targetId}.`, 'success');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Archive failed.', 'error');
    } finally {
      loading = false;
    }
  }

  async function restoreSelected() {
    if (!selectedId) {
      setMessage('Select an item to restore.', 'error');
      return;
    }

    if (!selectedArchived) {
      setMessage(`${entityTitle[selectedDataset]} ${selectedId} is already active.`, 'info');
      return;
    }

    const targetDataset = selectedDataset;
    const targetId = selectedId;
    const base = targetDataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const endpoint = `${base}/${encodeURIComponent(targetId)}/restore`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage(endpoint, res));
      }
      await loadData({ quiet: true });
      selectEntity(targetId, targetDataset);
      dirty = false;
      setMessage(`Restored ${targetDataset} ${targetId}.`, 'success');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed.', 'error');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
    const tick = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(tick);
  });
</script>

<BaseLayout title="Admin Portal | Metro ATL Transit Tracker">
  <section class="admin-page">
    <header class="admin-header panel">
      <div class="header-copy">
        <h1>Admin Portal</h1>
        <p>
          Edit projects and goals. Changes go live immediately and are logged to <a href="/history">/history</a>.
        </p>
      </div>
      <div class="header-status">
        <div class="status-line">
          <span class:loading class="status-pill">{loading ? 'Loading' : 'Ready'}</span>
          {#if lastLoadedAt}
            <span class="last-sync" title={formatTimestamp(lastLoadedAt)}>
              Refreshed {formatRelative(lastLoadedAt, now)}
            </span>
          {/if}
          <button class="refresh-button" on:click={() => loadData()} disabled={loading}>Refresh</button>
        </div>

        <details class="token-auth">
          <summary>Token auth (optional)</summary>
          <div class="token-auth-body">
            <label>
              API token
              <input
                bind:value={token}
                type="password"
                autocomplete="off"
                placeholder="Leave blank when signed in via Access"
              />
            </label>
            <label>
              Actor name
              <input bind:value={actor} type="text" autocomplete="off" placeholder="admin" />
              <small>Used when signing in with a token.</small>
            </label>
          </div>
        </details>
      </div>
    </header>

    {#if message}
      <p class={`message ${messageKind}`} role="status">{message}</p>
    {/if}

    <div class="admin-grid">
      <aside class="entity-list panel">
        <div class="list-actions" role="tablist" aria-label="Content type">
          <button
            role="tab"
            aria-selected={dataset === 'project'}
            class:active={dataset === 'project'}
            on:click={() => setDataset('project')}
            disabled={loading}
          >
            Projects ({projects.length})
          </button>
          <button
            role="tab"
            aria-selected={dataset === 'goal'}
            class:active={dataset === 'goal'}
            on:click={() => setDataset('goal')}
            disabled={loading}
          >
            Goals ({goals.length})
          </button>
        </div>

        <label class="search-field">
          <span class="search-label">
            <span>Search</span>
            <span class="collection-meta">{filteredItems.length} of {activeItems.length}</span>
          </span>
          <input
            bind:value={searchQuery}
            type="text"
            autocomplete="off"
            placeholder={`Find a ${dataset} by id or text`}
          />
        </label>

        <div class="list-toolbar">
          <button class="new-button" on:click={() => startNew(dataset)} disabled={loading}>
            + New {entityTitle[dataset]}
          </button>
          <label class="archive-toggle">
            <input type="checkbox" bind:checked={includeArchived} />
            Include archived
          </label>
        </div>

        <ul>
          {#if filteredItems.length === 0}
            <li class="empty-state">No {dataset}s match this filter.</li>
          {:else}
            {#each filteredItems as item (item.id)}
              <li class:selected={selectedDataset === dataset && selectedId === item.id}>
                <button
                  on:click={() => selectEntity(item.id, dataset)}
                  disabled={loading}
                  title={item.id}
                >
                  <span class="item-headline">{toEntityHeadline(item, dataset)}</span>
                  <span class="item-subline">{toEntitySubline(item, dataset)}</span>
                  {#if item.is_archived === true}
                    <span class="badge">archived</span>
                  {/if}
                </button>
              </li>
            {/each}
          {/if}
        </ul>
      </aside>

      <section class="editor-pane panel">
        <div class="editor-head">
          <h2>
            {selectedId
              ? `Editing ${entityTitle[selectedDataset]} ${selectedId}`
              : `New ${entityTitle[dataset]}`}
          </h2>
          <div class="editor-head-actions">
            <button on:click={formatEditorJson} disabled={loading}>Format JSON</button>
            {#if selectedId}
              <button class="ghost" on:click={closeEditor} disabled={loading} aria-label="Close editor">
                Close
              </button>
            {/if}
          </div>
        </div>

        {#if selectedEntity}
          <div class="entity-meta">
            <span class="meta-pill" class:archived={selectedArchived}>
              {selectedArchived ? 'Archived' : 'Active'}
            </span>
            <span class="meta-text">
              Updated
              {#if selectedEntity.provenance?.updated_at}
                <time
                  datetime={String(selectedEntity.provenance.updated_at)}
                  title={formatTimestamp(String(selectedEntity.provenance.updated_at))}
                >
                  {formatRelative(String(selectedEntity.provenance.updated_at), now)}
                </time>
              {:else}
                <span class="meta-dim">n/a</span>
              {/if}
              {#if selectedEntity.provenance?.updated_by}
                by <span class="meta-actor">{String(selectedEntity.provenance.updated_by)}</span>
              {/if}
            </span>
          </div>
        {/if}

        <p class="editor-note">
          Use Archive/Restore — don't edit <code>is_archived</code> fields by hand.
        </p>

        <textarea bind:value={editorJson} spellcheck="false" on:input={handleEditorInput}></textarea>

        {#if editorError}
          <p class="editor-state error">JSON error: {editorError}</p>
        {:else if dirty}
          <p class="editor-state warning">Unsaved changes.</p>
        {:else if selectedId}
          <p class="editor-state">Saved.</p>
        {/if}

        <div class="editor-actions">
          <button class="primary" on:click={saveEntity} disabled={loading || editorError.length > 0}>
            {selectedId ? 'Save Changes' : `Create ${entityTitle[dataset]}`}
          </button>
          <button on:click={archiveSelected} disabled={loading || !selectedId || selectedArchived}>
            Archive
          </button>
          <button on:click={restoreSelected} disabled={loading || !selectedId || !selectedArchived}>
            Restore
          </button>
        </div>
      </section>
    </div>

    <section class="history-preview panel">
      <h2>Recent Changes</h2>
      {#if history.length === 0}
        <p class="empty-history">No recent changes.</p>
      {:else}
        <ul>
          {#each history as event (event.id)}
            <li>
              <span class={`action-pill action-${event.action}`}>{event.action}</span>
              <button
                class="entity-ref"
                on:click={() => selectEntity(event.entity_id, event.entity_type as EditorEntity)}
                disabled={loading}
                title={`Open ${event.entity_type} ${event.entity_id}`}
              >
                {event.entity_type}:{event.entity_id}
              </button>
              <time
                class="history-time"
                datetime={event.timestamp}
                title={formatTimestamp(event.timestamp)}
              >
                {formatRelative(event.timestamp, now)}
              </time>
              <span class="history-actor">by {event.actor}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </section>
</BaseLayout>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .panel {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.18);
    padding: 0.9rem;
  }

  .admin-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .admin-header h1 {
    margin: 0;
  }

  .admin-header p {
    margin: 0.35rem 0;
    color: var(--text-muted, #c6cbc6);
  }

  .header-status {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-end;
    min-width: 14rem;
  }

  .status-line {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .status-pill {
    border: 1px solid rgba(66, 128, 196, 0.55);
    background: rgba(66, 128, 196, 0.16);
    color: #d5e8ff;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .status-pill.loading {
    border-color: rgba(247, 215, 181, 0.55);
    background: rgba(247, 215, 181, 0.15);
    color: #f7d7b5;
  }

  .last-sync {
    font-size: 0.78rem;
    color: var(--text-muted, #c6cbc6);
  }

  .refresh-button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .refresh-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .token-auth {
    font-size: 0.82rem;
    color: var(--text-muted, #c6cbc6);
    align-self: stretch;
  }

  .token-auth > summary {
    list-style: none;
    cursor: pointer;
    color: var(--text-dim, #9fa7a2);
    text-align: right;
    padding: 0.15rem 0;
    user-select: none;
  }

  .token-auth > summary::before {
    content: '▸';
    display: inline-block;
    margin-right: 0.35rem;
    transition: transform 120ms ease;
  }

  .token-auth[open] > summary::before {
    transform: rotate(90deg);
  }

  .token-auth-body {
    margin-top: 0.5rem;
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    align-items: start;
    padding: 0.65rem;
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.18);
  }

  .token-auth-body label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
    color: var(--text-on-dark, #f3f2ee);
    text-align: left;
  }

  .token-auth-body small {
    color: var(--text-dim, #9fa7a2);
    font-size: 0.72rem;
  }

  input,
  button,
  textarea {
    font: inherit;
  }

  .token-auth-body input,
  .search-field input {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    padding: 0.45rem 0.6rem;
    font-size: 1rem;
  }

  .entity-list button,
  .editor-pane button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  .entity-list button:disabled,
  .editor-pane button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .admin-page button:focus-visible,
  .admin-page input:focus-visible,
  .admin-page textarea:focus-visible,
  .admin-page summary:focus-visible {
    outline: 2px solid rgba(66, 128, 196, 0.75);
    outline-offset: 2px;
  }

  .message {
    margin: 0;
    padding: 0.65rem 0.8rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
  }

  .message.info {
    background: rgba(66, 128, 196, 0.15);
    border-color: rgba(66, 128, 196, 0.4);
  }

  .message.success {
    background: rgba(64, 156, 106, 0.18);
    border-color: rgba(64, 156, 106, 0.45);
  }

  .message.error {
    background: rgba(167, 58, 50, 0.2);
    border-color: rgba(167, 58, 50, 0.5);
  }

  .admin-grid {
    display: grid;
    grid-template-columns: minmax(16rem, 24rem) 1fr;
    gap: 1rem;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .list-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .list-actions button.active {
    border-color: rgba(66, 128, 196, 0.7);
    background: rgba(66, 128, 196, 0.22);
  }

  .list-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .new-button {
    flex: 1;
  }

  .archive-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--text-muted, #c6cbc6);
    white-space: nowrap;
  }

  .search-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.86rem;
  }

  .search-label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .collection-meta {
    font-size: 0.74rem;
    color: var(--text-dim, #9fa7a2);
    font-variant-numeric: tabular-nums;
  }

  .entity-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.4rem;
    max-height: 32rem;
    overflow: auto;
  }

  .entity-list li button {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 0.18rem;
    align-items: flex-start;
    font-size: 0.8rem;
    position: relative;
    padding-right: 3.8rem;
  }

  .entity-list li.selected button {
    border-color: rgba(66, 128, 196, 0.65);
    background: rgba(66, 128, 196, 0.2);
  }

  .item-headline {
    font-size: 0.87rem;
    font-weight: 600;
    color: #f0f1f0;
    line-height: 1.3;
  }

  .item-subline {
    color: var(--text-muted, #c6cbc6);
    font-size: 0.74rem;
  }

  .badge {
    position: absolute;
    right: 0.5rem;
    top: 0.45rem;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #f7d7b5;
  }

  .empty-state {
    border: 1px dashed var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    padding: 0.65rem;
    color: var(--text-muted, #c6cbc6);
    font-size: 0.84rem;
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .editor-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
  }

  .editor-head h2 {
    margin: 0;
    font-size: 1rem;
    word-break: break-word;
  }

  .editor-head-actions {
    display: inline-flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .editor-head-actions .ghost {
    background: transparent;
    color: var(--text-muted, #c6cbc6);
  }

  .editor-head-actions .ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
  }

  .editor-note {
    margin: 0;
    color: var(--text-muted, #c6cbc6);
    font-size: 0.8rem;
  }

  .editor-note code {
    background: rgba(0, 0, 0, 0.28);
    padding: 0.05rem 0.3rem;
    border-radius: 0.3rem;
    font-size: 0.78rem;
  }

  .editor-pane textarea {
    min-height: 24rem;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    color: inherit;
    font-family: var(--font-mono, monospace);
    font-size: max(0.84rem, 16px);
    line-height: 1.5;
    padding: 0.65rem;
  }

  .editor-state {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #c6cbc6);
  }

  .editor-state.warning {
    color: #f7d7b5;
  }

  .editor-state.error {
    color: #f0b8b3;
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .editor-actions .primary {
    border-color: rgba(66, 128, 196, 0.7);
    background: rgba(66, 128, 196, 0.25);
  }

  .entity-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(0, 0, 0, 0.14);
    font-size: 0.82rem;
    color: var(--text-muted, #c6cbc6);
  }

  .meta-pill {
    border: 1px solid rgba(64, 156, 106, 0.55);
    background: rgba(64, 156, 106, 0.18);
    color: #c7eed6;
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .meta-pill.archived {
    border-color: rgba(247, 215, 181, 0.55);
    background: rgba(247, 215, 181, 0.15);
    color: #f7d7b5;
  }

  .meta-text time {
    font-variant-numeric: tabular-nums;
  }

  .meta-actor {
    color: var(--text-on-dark, #f3f2ee);
    font-family: var(--font-mono, monospace);
    font-size: 0.78rem;
  }

  .meta-dim {
    color: var(--text-dim, #9fa7a2);
  }

  .history-preview h2 {
    margin: 0 0 0.55rem;
  }

  .history-preview ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }

  .history-preview li {
    display: grid;
    grid-template-columns: 5rem minmax(12rem, 1fr) minmax(6rem, auto) minmax(6rem, auto);
    align-items: center;
    gap: 0.55rem;
    font-size: 0.82rem;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
    padding-bottom: 0.4rem;
  }

  .action-pill {
    display: inline-block;
    text-align: center;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid transparent;
  }

  .action-create {
    border-color: rgba(64, 156, 106, 0.55);
    background: rgba(64, 156, 106, 0.18);
    color: #c7eed6;
  }

  .action-update {
    border-color: rgba(66, 128, 196, 0.55);
    background: rgba(66, 128, 196, 0.18);
    color: #d5e8ff;
  }

  .action-archive {
    border-color: rgba(247, 215, 181, 0.55);
    background: rgba(247, 215, 181, 0.15);
    color: #f7d7b5;
  }

  .action-restore {
    border-color: rgba(126, 110, 79, 0.55);
    background: rgba(126, 110, 79, 0.22);
    color: var(--text-on-dark, #f3f2ee);
  }

  .entity-ref {
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 0.15rem 0.3rem;
    margin-left: -0.3rem;
    border-radius: 0.35rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .entity-ref:hover:not(:disabled) {
    background: rgba(66, 128, 196, 0.14);
    color: #d5e8ff;
  }

  .entity-ref:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .history-time {
    color: var(--text-muted, #c6cbc6);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }

  .history-actor {
    color: var(--text-dim, #9fa7a2);
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  .empty-history {
    margin: 0;
    color: var(--text-muted, #c6cbc6);
    font-size: 0.9rem;
  }

  @media (max-width: 1000px) {
    .admin-grid {
      grid-template-columns: 1fr;
    }

    .history-preview li {
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'pill entity'
        'time actor';
      gap: 0.2rem 0.55rem;
    }

    .history-preview .action-pill {
      grid-area: pill;
    }

    .history-preview .entity-ref {
      grid-area: entity;
    }

    .history-preview .history-time {
      grid-area: time;
    }

    .history-preview .history-actor {
      grid-area: actor;
      text-align: right;
    }
  }

  @media (max-width: 700px) {
    .admin-header {
      flex-direction: column;
    }

    .header-status {
      align-items: flex-start;
      min-width: auto;
    }

    .status-line {
      justify-content: flex-start;
    }

    .token-auth > summary {
      text-align: left;
    }

    .list-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .editor-pane textarea {
      min-height: 16rem;
    }
  }

  @media (max-height: 640px) {
    .editor-pane textarea {
      min-height: 14rem;
    }
  }

  @media (pointer: coarse) {
    .admin-page button,
    .admin-page .archive-toggle,
    .admin-page summary {
      min-height: 2.75rem;
    }

    .admin-page .refresh-button,
    .admin-page .action-pill,
    .admin-page .meta-pill,
    .admin-page .status-pill,
    .admin-page .badge {
      min-height: 0;
    }

    .admin-page button {
      padding-block: 0.55rem;
    }

    .admin-page .refresh-button {
      padding-block: 0.3rem;
    }

    .admin-page input[type='checkbox'] {
      width: 1.15rem;
      height: 1.15rem;
    }
  }
</style>
