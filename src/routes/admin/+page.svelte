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

    const haystack = `${item.id} ${toEntityHeadline(item)} ${toEntitySubline(item)}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
  $: selectedEntity = activeItems.find((item) => item.id === selectedId) ?? null;
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
    selectedId = '';
    const template = mode === 'project' ? newProjectTemplate : newGoalTemplate;
    editorJson = `${JSON.stringify(template, null, 2)}\n`;
    dirty = false;
    validateEditorJson();
  }

  function selectEntity(id: string) {
    const entity = activeItems.find((item) => item.id === id);
    if (!entity) {
      setMessage(`Could not find ${dataset} ${id}`, 'error');
      return;
    }
    selectedId = id;
    setEditorFromEntity(entity);
  }

  function toEntityHeadline(item: EntityItem) {
    if (dataset === 'project') {
      const project = item as Project;
      return project.title?.trim() || project.id;
    }
    const goal = item as Goal;
    return goal.goal?.trim() || goal.id;
  }

  function toEntitySubline(item: EntityItem) {
    if (dataset === 'project') {
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

      if (previousSelection) {
        const exists = (dataset === 'project' ? projectData : goalData).some((item) => item.id === previousSelection);
        if (exists) {
          selectEntity(previousSelection);
        } else {
          startNew(dataset);
        }
      } else if (!selectedId) {
        startNew(dataset);
      }

      if (!options.quiet) {
        setMessage('Loaded latest content from D1.', 'success');
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

    if (!selectedId) {
      const candidateId = parsed.id;
      if (typeof candidateId !== 'string' || candidateId.trim().length === 0) {
        setMessage(`New ${dataset}s must include a non-empty "id".`, 'error');
        return;
      }
    }

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    const isCreate = selectedId.length === 0;
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
        selectEntity(savedId);
      }
      dirty = false;
      setMessage(isCreate ? `Created ${dataset} ${savedId}.` : `Updated ${dataset} ${savedId}.`, 'success');
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
      setMessage(`${entityTitle[dataset]} ${selectedId} is already archived.`, 'info');
      return;
    }

    const proceed = window.confirm(`Archive ${entityTitle[dataset].toLowerCase()} ${selectedId}?`);
    if (!proceed) {
      return;
    }

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const endpoint = `${base}/${encodeURIComponent(selectedId)}`;
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage(endpoint, res));
      }
      await loadData({ quiet: true });
      if (selectedId) {
        selectEntity(selectedId);
      }
      dirty = false;
      setMessage(`Archived ${dataset} ${selectedId}.`, 'success');
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
      setMessage(`${entityTitle[dataset]} ${selectedId} is already active.`, 'info');
      return;
    }

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const endpoint = `${base}/${encodeURIComponent(selectedId)}/restore`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage(endpoint, res));
      }
      await loadData({ quiet: true });
      if (selectedId) {
        selectEntity(selectedId);
      }
      dirty = false;
      setMessage(`Restored ${dataset} ${selectedId}.`, 'success');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed.', 'error');
    } finally {
      loading = false;
    }
  }

  onMount(loadData);
</script>

<BaseLayout title="Admin Portal | Metro ATL Transit Tracker">
  <section class="admin-page">
    <header class="admin-header panel">
      <div class="header-copy">
        <h1>Admin Portal</h1>
        <p>Edit projects and goals directly in D1. Changes publish immediately to the public site and history feed.</p>
        <p>
          Public history is available at <a href="/history">/history</a>.
        </p>
      </div>
      <div class="header-status">
        <span class:loading={loading} class="status-pill">{loading ? 'Loading' : 'Ready'}</span>
        {#if lastLoadedAt}
          <span class="last-sync">Last refreshed: {formatTimestamp(lastLoadedAt)}</span>
        {/if}
      </div>
    </header>

    <section class="auth-bar panel">
      <label>
        Editor Token
        <input bind:value={token} type="password" autocomplete="off" placeholder="Optional in Cloudflare Access mode" />
      </label>
      <label>
        Actor (token mode)
        <input bind:value={actor} type="text" autocomplete="off" placeholder="admin" />
      </label>
      <button on:click={() => loadData()} disabled={loading}>Refresh Data</button>
    </section>

    {#if message}
      <p class={`message ${messageKind}`}>{message}</p>
    {/if}

    <div class="admin-grid">
      <aside class="entity-list panel">
        <div class="list-actions">
          <button
            class:active={dataset === 'project'}
            on:click={() => startNew('project')}
            disabled={loading}
          >
            Projects ({projects.length})
          </button>
          <button class:active={dataset === 'goal'} on:click={() => startNew('goal')} disabled={loading}>
            Goals ({goals.length})
          </button>
        </div>

        <div class="list-toolbar">
          <button class="new-button" on:click={() => startNew(dataset)} disabled={loading}>
            New {entityTitle[dataset]}
          </button>
          <label class="archive-toggle">
            <input type="checkbox" bind:checked={includeArchived} />
            Include archived
          </label>
        </div>

        <label class="search-field">
          Search
          <input
            bind:value={searchQuery}
            type="text"
            autocomplete="off"
            placeholder={`Find a ${dataset} by id or text`}
          />
        </label>

        <p class="collection-meta">Showing {filteredItems.length} of {activeItems.length}</p>

        <ul>
          {#if filteredItems.length === 0}
            <li class="empty-state">No {dataset}s match this filter.</li>
          {:else}
            {#each filteredItems as item (item.id)}
              <li class:selected={selectedId === item.id}>
                <button on:click={() => selectEntity(item.id)} disabled={loading}>
                  <span class="item-headline">{toEntityHeadline(item)}</span>
                  <span class="item-subline">{toEntitySubline(item)}</span>
                  <span class="item-id">{item.id}</span>
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
          <h2>{selectedId ? `Editing ${entityTitle[dataset]} ${selectedId}` : `Create ${entityTitle[dataset]}`}</h2>
          <button on:click={formatEditorJson} disabled={loading}>Format JSON</button>
        </div>

        <p class="editor-note">
          Keep server-managed archive fields out of manual edits. Use the Archive and Restore buttons instead.
        </p>

        <textarea bind:value={editorJson} spellcheck="false" on:input={handleEditorInput}></textarea>

        {#if editorError}
          <p class="editor-state error">JSON error: {editorError}</p>
        {:else if dirty}
          <p class="editor-state warning">Unsaved changes.</p>
        {:else}
          <p class="editor-state">No unsaved changes.</p>
        {/if}

        <div class="editor-actions">
          <button class="primary" on:click={saveEntity} disabled={loading || editorError.length > 0}>
            {selectedId ? 'Save Changes' : `Create ${entityTitle[dataset]}`}
          </button>
          <button on:click={archiveSelected} disabled={loading || !selectedId || selectedArchived}>Archive</button>
          <button on:click={restoreSelected} disabled={loading || !selectedId || !selectedArchived}>Restore</button>
        </div>

        {#if selectedEntity}
          <dl class="entity-meta">
            <div>
              <dt>Status</dt>
              <dd>{selectedArchived ? 'Archived' : 'Active'}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                {#if selectedEntity.provenance?.updated_at}
                  {formatTimestamp(String(selectedEntity.provenance.updated_at))}
                {:else}
                  n/a
                {/if}
              </dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>
                {#if selectedEntity.provenance?.updated_by}
                  {String(selectedEntity.provenance.updated_by)}
                {:else}
                  n/a
                {/if}
              </dd>
            </div>
          </dl>
        {/if}
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
              <span>{formatTimestamp(event.timestamp)}</span>
              <span>{event.action}</span>
              <span>{event.entity_type}:{event.entity_id}</span>
              <span>by {event.actor}</span>
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
    gap: 0.35rem;
    align-items: flex-end;
    min-width: 12rem;
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

  .auth-bar {
    display: grid;
    grid-template-columns: 1fr 16rem auto;
    gap: 0.75rem;
    align-items: end;
  }

  .auth-bar label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }

  input,
  button,
  textarea {
    font: inherit;
  }

  .auth-bar input,
  .search-field input {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    padding: 0.45rem 0.6rem;
  }

  .auth-bar button,
  .entity-list button,
  .editor-pane button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  .auth-bar button:disabled,
  .entity-list button:disabled,
  .editor-pane button:disabled {
    opacity: 0.55;
    cursor: default;
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

  .collection-meta {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted, #c6cbc6);
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
    gap: 0.16rem;
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
  }

  .item-subline {
    color: var(--text-muted, #c6cbc6);
    font-size: 0.74rem;
  }

  .item-id {
    color: var(--text-dim, #9fa7a2);
    font-family: var(--font-mono, monospace);
    font-size: 0.72rem;
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
  }

  .editor-note {
    margin: 0;
    color: var(--text-muted, #c6cbc6);
    font-size: 0.85rem;
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
    font-size: 0.84rem;
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
    margin: 0.1rem 0 0;
    padding: 0.65rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(0, 0, 0, 0.14);
    display: grid;
    gap: 0.4rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .entity-meta div {
    min-width: 0;
  }

  .entity-meta dt {
    font-size: 0.72rem;
    color: var(--text-dim, #9fa7a2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .entity-meta dd {
    margin: 0.1rem 0 0;
    font-size: 0.82rem;
    font-family: var(--font-mono, monospace);
    overflow-wrap: anywhere;
  }

  .history-preview h2 {
    margin: 0 0 0.55rem;
  }

  .history-preview ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .history-preview li {
    display: grid;
    grid-template-columns: minmax(8rem, 13rem) 5.5rem minmax(12rem, 1fr) minmax(7rem, auto);
    gap: 0.45rem;
    font-size: 0.8rem;
    font-family: var(--font-mono, monospace);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
    padding-bottom: 0.35rem;
  }

  .empty-history {
    margin: 0;
    color: var(--text-muted, #c6cbc6);
    font-size: 0.9rem;
  }

  @media (max-width: 1000px) {
    .auth-bar {
      grid-template-columns: 1fr;
    }

    .admin-grid {
      grid-template-columns: 1fr;
    }

    .history-preview li {
      grid-template-columns: 1fr;
      gap: 0.15rem;
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

    .list-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .entity-meta {
      grid-template-columns: 1fr;
    }
  }
</style>
