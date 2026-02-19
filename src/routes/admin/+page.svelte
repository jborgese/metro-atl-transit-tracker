<script lang="ts">
  import { onMount } from 'svelte';
  import BaseLayout from '../../layouts/BaseLayout.svelte';
  import type { ContentHistoryEvent, Goal, Project } from '@/types/content';

  type EditorEntity = 'project' | 'goal';

  let token = '';
  let actor = 'admin';
  let dataset: EditorEntity = 'project';
  let projects: Project[] = [];
  let goals: Goal[] = [];
  let history: ContentHistoryEvent[] = [];
  let selectedId = '';
  let editorJson = '';
  let loading = false;
  let message = '';
  let messageKind: 'info' | 'error' = 'info';

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

  async function fetchCollection<T>(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status}`);
    }
    const payload = await res.json();
    if (Array.isArray(payload)) {
      return payload as T[];
    }
    return (payload?.data ?? []) as T[];
  }

  async function loadData() {
    loading = true;
    try {
      const [projectData, goalData, historyData] = await Promise.all([
        fetchCollection<Project>('/api/projects?includeArchived=true'),
        fetchCollection<Goal>('/api/goals?includeArchived=true'),
        fetchCollection<ContentHistoryEvent>('/api/history?limit=100'),
      ]);
      projects = projectData;
      goals = goalData;
      history = historyData;
      if (!selectedId) {
        startNew(dataset);
      }
      setMessage('Loaded latest content.', 'info');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load content.', 'error');
    } finally {
      loading = false;
    }
  }

  function setMessage(next: string, kind: 'info' | 'error') {
    message = next;
    messageKind = kind;
  }

  function currentItems() {
    return dataset === 'project' ? projects : goals;
  }

  function selectEntity(id: string) {
    selectedId = id;
    const entity = currentItems().find((item) => item.id === id);
    if (!entity) {
      setMessage(`Could not find ${dataset} ${id}`, 'error');
      return;
    }
    editorJson = `${JSON.stringify(entity, null, 2)}\n`;
  }

  function startNew(mode: EditorEntity) {
    dataset = mode;
    selectedId = '';
    editorJson =
      mode === 'project'
        ? `${JSON.stringify(newProjectTemplate, null, 2)}\n`
        : `${JSON.stringify(newGoalTemplate, null, 2)}\n`;
  }

  async function saveEntity() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorJson);
    } catch {
      setMessage('Editor JSON is invalid. Fix formatting and try again.', 'error');
      return;
    }

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    const isCreate = selectedId.length === 0;
    const endpoint = isCreate ? base : `${base}/${encodeURIComponent(selectedId)}`;
    const method = isCreate ? 'POST' : 'PATCH';

    loading = true;
    try {
      const res = await fetch(endpoint, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(parsed),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Save failed (${res.status}): ${text}`);
      }

      let savedId = selectedId;
      try {
        const payload = JSON.parse(text);
        savedId = payload?.data?.id || savedId || '';
      } catch {
        // ignore JSON parse failures and keep current id
      }

      await loadData();
      if (savedId) {
        selectEntity(savedId);
      }
      setMessage(isCreate ? `Created ${dataset}.` : `Updated ${dataset} ${savedId}.`, 'info');
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

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const res = await fetch(`${base}/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Archive failed (${res.status}): ${text}`);
      }
      await loadData();
      selectEntity(selectedId);
      setMessage(`Archived ${dataset} ${selectedId}.`, 'info');
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

    const base = dataset === 'project' ? '/api/projects' : '/api/goals';
    loading = true;
    try {
      const res = await fetch(`${base}/${encodeURIComponent(selectedId)}/restore`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Restore failed (${res.status}): ${text}`);
      }
      await loadData();
      selectEntity(selectedId);
      setMessage(`Restored ${dataset} ${selectedId}.`, 'info');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed.', 'error');
    } finally {
      loading = false;
    }
  }

  function isArchived(item: Project | Goal) {
    return item.is_archived === true;
  }

  onMount(loadData);
</script>

<BaseLayout title="Admin Portal | Metro ATL Transit Tracker">
  <section class="admin-page">
    <header class="admin-header">
      <h1>Admin Portal</h1>
      <p>
        Editors can publish immediately. Use an editor token (header-based) until a full auth provider is selected.
      </p>
      <p>
        Public history is available at <a href="/history">/history</a>.
      </p>
    </header>

    <div class="auth-bar">
      <label>
        Editor Token
        <input bind:value={token} type="password" autocomplete="off" />
      </label>
      <label>
        Actor
        <input bind:value={actor} type="text" autocomplete="off" />
      </label>
      <button on:click={loadData} disabled={loading}>Refresh</button>
    </div>

    {#if message}
      <p class={`message ${messageKind}`}>{message}</p>
    {/if}

    <div class="admin-grid">
      <aside class="entity-list">
        <div class="list-actions">
          <button
            class:active={dataset === 'project'}
            on:click={() => {
              dataset = 'project';
              startNew('project');
            }}
          >
            Projects ({projects.length})
          </button>
          <button
            class:active={dataset === 'goal'}
            on:click={() => {
              dataset = 'goal';
              startNew('goal');
            }}
          >
            Goals ({goals.length})
          </button>
        </div>

        <button class="new-button" on:click={() => startNew(dataset)}>New {dataset}</button>

        <ul>
          {#each currentItems() as item (item.id)}
            <li class:selected={selectedId === item.id}>
              <button on:click={() => selectEntity(item.id)}>
                <span>{item.id}</span>
                {#if isArchived(item)}
                  <span class="badge">archived</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </aside>

      <section class="editor-pane">
        <h2>{selectedId ? `Editing ${dataset} ${selectedId}` : `Create ${dataset}`}</h2>
        <textarea bind:value={editorJson} spellcheck="false"></textarea>
        <div class="editor-actions">
          <button on:click={saveEntity} disabled={loading}>Save</button>
          <button on:click={archiveSelected} disabled={loading || !selectedId}>Archive</button>
          <button on:click={restoreSelected} disabled={loading || !selectedId}>Restore</button>
        </div>
      </section>
    </div>

    <section class="history-preview">
      <h2>Recent Changes</h2>
      <ul>
        {#each history as event (event.id)}
          <li>
            <span>{new Date(event.timestamp).toLocaleString()}</span>
            <span>{event.action}</span>
            <span>{event.entity_type}:{event.entity_id}</span>
            <span>by {event.actor}</span>
          </li>
        {/each}
      </ul>
    </section>
  </section>
</BaseLayout>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .admin-header p {
    margin: 0.4rem 0;
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

  .auth-bar input {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    padding: 0.45rem 0.6rem;
  }

  .auth-bar button,
  .entity-list button,
  .editor-actions button,
  .new-button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  .auth-bar button:disabled,
  .editor-actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .message {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
  }

  .message.info {
    background: rgba(66, 128, 196, 0.15);
    border-color: rgba(66, 128, 196, 0.4);
  }

  .message.error {
    background: rgba(167, 58, 50, 0.2);
    border-color: rgba(167, 58, 50, 0.5);
  }

  .admin-grid {
    display: grid;
    grid-template-columns: minmax(14rem, 20rem) 1fr;
    gap: 1rem;
  }

  .entity-list {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.18);
  }

  .list-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .list-actions button.active {
    border-color: rgba(66, 128, 196, 0.6);
  }

  .new-button {
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .entity-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
    max-height: 28rem;
    overflow: auto;
  }

  .entity-list li button {
    width: 100%;
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.82rem;
  }

  .entity-list li.selected button {
    border-color: rgba(66, 128, 196, 0.6);
    background: rgba(66, 128, 196, 0.18);
  }

  .badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #f7d7b5;
  }

  .editor-pane {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .editor-pane h2 {
    margin: 0;
    font-size: 1rem;
  }

  .editor-pane textarea {
    min-height: 24rem;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.28);
    color: inherit;
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.65rem;
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .history-preview {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.18);
  }

  .history-preview h2 {
    margin-top: 0;
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
    gap: 0.5rem;
    font-size: 0.82rem;
    font-family: var(--font-mono, monospace);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
    padding-bottom: 0.35rem;
  }

  @media (max-width: 900px) {
    .auth-bar {
      grid-template-columns: 1fr;
    }

    .admin-grid {
      grid-template-columns: 1fr;
    }

    .history-preview li {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
  }
</style>
