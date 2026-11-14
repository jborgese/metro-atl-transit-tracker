<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import ConfirmDialog from '../../components/svelte/admin/ConfirmDialog.svelte';
  import EditorPane from '../../components/svelte/admin/EditorPane.svelte';
  import BaseLayout from '../../layouts/BaseLayout.svelte';
  import type { WriteMode } from '#lib/content/formModel/payload.ts';
  import { parseServerError } from '#lib/content/formModel/serverErrors.ts';
  import type { ContentRecord } from '#lib/content/formModel/types.ts';
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';
  import type { ContentHistoryEvent, Goal, Project, TimedAction } from '#types/content.ts';
  import { entityTypeLabel } from '../../utils/entityLabels';
  import { DATASETS, isEditorEntity, type EditorEntity } from './datasets';

  type EntityItem = Project | Goal | TimedAction;
  type MessageKind = 'info' | 'success' | 'error';
  interface SaveRequest {
    mode: WriteMode;
    body: Record<string, unknown>;
  }

  const UNREACHABLE = 'Could not reach the server. Your sign-in may have expired.';

  let token = $state('');
  let actor = $state('admin');
  let dataset: EditorEntity = $state('project');
  let selectedDataset: EditorEntity = $state('project');
  let projects: Project[] = $state([]);
  let goals: Goal[] = $state([]);
  let timedActions: TimedAction[] = $state([]);
  let history: ContentHistoryEvent[] = $state([]);
  let selectedId = $state('');
  let searchQuery = $state('');
  let includeArchived = $state(true);
  let loading = $state(false);
  let message = $state('');
  let messageKind: MessageKind = $state('info');
  let confirmDialog: ConfirmDialog | undefined = $state();
  let pane: EditorPane | undefined = $state();
  let editorVersion = $state(0);
  let saving = $state(false);
  let serverIssue: FieldIssue | null = $state(null);
  let writing = false;
  let editorIsPlaceholder = true;
  let lastLoadedAt = $state('');
  let now = $state(Date.now());

  let myIdentity: string | null = $state(null);
  let myActor: string | null = $state(null);
  let myDisplayName = $state('');
  let savedDisplayName: string | null = $state(null);
  let savingDisplayName = $state(false);
  const displayNameDirty = $derived(myDisplayName.trim() !== (savedDisplayName ?? ''));

  const lists: Record<EditorEntity, EntityItem[]> = $derived({
    project: projects,
    goal: goals,
    timed_action: timedActions,
  });
  const entityKinds = Object.keys(DATASETS).filter(isEditorEntity);
  const activeItems: EntityItem[] = $derived(lists[dataset]);
  const searchTerm = $derived(searchQuery.trim().toLowerCase());
  const filteredItems: EntityItem[] = $derived(
    activeItems.filter((item) => {
      if (!includeArchived && item.is_archived === true) {
        return false;
      }
      if (!searchTerm) {
        return true;
      }

      const haystack =
        `${item.id} ${toEntityHeadline(item, dataset)} ${toEntitySubline(item, dataset)}`.toLowerCase();
      return haystack.includes(searchTerm);
    }),
  );
  const selectedEntity: EntityItem | null = $derived(
    selectedId ? (lists[selectedDataset].find((item) => item.id === selectedId) ?? null) : null,
  );
  const selectedArchived = $derived(selectedEntity?.is_archived === true);
  const selectedRecord: ContentRecord | null = $derived(
    selectedEntity === null ? null : { ...selectedEntity },
  );
  const existingIds = $derived(lists[selectedDataset].map((item) => item.id));
  const paneKey = $derived(
    [selectedDataset, selectedId, selectedEntity?.provenance?.updated_at ?? '', editorVersion].join(
      '|',
    ),
  );

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

  async function readServerError(url: string, res: Response) {
    const raw = (await res.text()).trim();
    try {
      return parseServerError(res.status, JSON.parse(raw), url);
    } catch {
      return {
        message: raw ? `${url} returned ${res.status}: ${raw}` : `${url} returned ${res.status}`,
        issue: null,
      };
    }
  }

  async function toResponseErrorMessage(url: string, res: Response) {
    return (await readServerError(url, res)).message;
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

  function openEditor() {
    serverIssue = null;
    editorVersion += 1;
  }

  function startNew(mode: EditorEntity, placeholder = false) {
    editorIsPlaceholder = placeholder;
    dataset = mode;
    selectedDataset = mode;
    selectedId = '';
    openEditor();
  }

  function editorIsDirty() {
    return pane?.isDirty() ?? false;
  }

  function setDataset(kind: EditorEntity) {
    if (dataset === kind) {
      return;
    }
    dataset = kind;
    searchQuery = '';
    if (!selectedId && !editorIsDirty() && editorIsPlaceholder) {
      startNew(kind, true);
    }
  }

  function selectEntity(id: string, kind: EditorEntity) {
    const entity = lists[kind].find((item) => item.id === id);
    if (!entity) {
      setMessage(`Could not find ${entityNoun(kind)} ${id}`, 'error');
      return;
    }
    dataset = kind;
    selectedDataset = kind;
    selectedId = id;
    openEditor();
  }

  async function confirmLeave(): Promise<boolean> {
    if (!editorIsDirty()) {
      return true;
    }
    const title = DATASETS[selectedDataset].title;
    return (
      (await confirmDialog?.ask({
        title: selectedId
          ? `Discard your changes to ${title} ${selectedId}?`
          : `Discard your changes to this new ${title.toLowerCase()}?`,
        body: 'Your unsaved changes will be lost.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
      })) ?? false
    );
  }

  async function handleSelect(id: string, kind: EditorEntity) {
    if (await confirmLeave()) {
      selectEntity(id, kind);
    }
  }

  async function handleNew() {
    if (await confirmLeave()) {
      startNew(dataset);
    }
  }

  async function handleRefresh() {
    if (!(await confirmLeave())) {
      return;
    }
    if (!selectedId) {
      openEditor();
    }
    await loadData();
  }

  async function closeEditor() {
    if (await confirmLeave()) {
      startNew(dataset, true);
      await tick();
      pane?.focusHeading();
    }
  }

  function handleTabKeydown(event: KeyboardEvent, kind: EditorEntity) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const last = entityKinds.length - 1;
    const index = entityKinds.indexOf(kind);
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    const nextKind = target === undefined ? undefined : entityKinds[target];
    if (!nextKind) {
      return;
    }
    event.preventDefault();
    setDataset(nextKind);
    document.getElementById(`tab-${nextKind}`)?.focus();
  }

  beforeNavigate(({ cancel }) => {
    if (editorIsDirty()) {
      cancel();
    }
  });

  function entityNoun(kind: EditorEntity) {
    return DATASETS[kind].title.toLowerCase();
  }

  const headlineOf: Record<EditorEntity, (item: EntityItem) => string> = {
    project: (item) => (item as Project).title?.trim() || item.id,
    goal: (item) => (item as Goal).goal?.trim() || item.id,
    timed_action: (item) => (item as TimedAction).description?.trim() || item.id,
  };

  const sublineOf: Record<EditorEntity, (item: EntityItem) => string> = {
    project: (item) => (item as Project).status?.trim() || 'status unknown',
    goal: (item) => {
      const ids = (item as Goal).related_project_ids;
      return `${Array.isArray(ids) ? ids.length : 0} related projects`;
    },
    timed_action: (item) => {
      const action = item as TimedAction;
      return `${action.expires_on?.trim() || 'no expiry date'} · ${action.goal_id}`;
    },
  };

  function toEntityHeadline(item: EntityItem, kind: EditorEntity) {
    return headlineOf[kind](item);
  }

  function toEntitySubline(item: EntityItem, kind: EditorEntity) {
    return sublineOf[kind](item);
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
    if (absDiff < 7 * day)
      return `${Math.round(absDiff / day)} day${Math.round(absDiff / day) === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString();
  }

  interface LoadFailure {
    label: string;
    reason: string;
  }

  function describeLoadFailure(failure: LoadFailure | null) {
    return failure ? `${failure.label} could not be reloaded: ${failure.reason}` : '';
  }

  function replaceById<T extends EntityItem>(list: T[], record: T): T[] {
    return list.some((item) => item.id === record.id)
      ? list.map((item) => (item.id === record.id ? record : item))
      : [...list, record];
  }

  const upsertInto: Record<EditorEntity, (record: EntityItem) => void> = {
    project: (record) => {
      projects = replaceById(projects, record as Project);
    },
    goal: (record) => {
      goals = replaceById(goals, record as Goal);
    },
    timed_action: (record) => {
      timedActions = replaceById(timedActions, record as TimedAction);
    },
  };

  async function readReturnedRecord(res: Response): Promise<EntityItem | null> {
    try {
      const payload = (await res.json()) as Record<string, unknown>;
      return isRecord(payload.data) && typeof payload.data.id === 'string'
        ? (payload.data as unknown as EntityItem)
        : null;
    } catch {
      return null;
    }
  }

  async function focusEditorHeading() {
    await tick();
    pane?.focusHeading();
  }

  function finishWrite(summary: string, failure: LoadFailure | null) {
    if (failure) {
      setMessage(`${summary} Saved, but ${describeLoadFailure(failure)}`, 'error');
    } else {
      setMessage(summary, 'success');
    }
    void focusEditorHeading();
  }

  async function loadData(options: { quiet?: boolean } = {}): Promise<LoadFailure | null> {
    loading = true;
    const previousSelection = selectedId;
    const previousSelectedDataset = selectedDataset;
    let failure: LoadFailure | null = null;

    try {
      const [projectData, goalData, timedActionData, historyData] = await Promise.all([
        fetchCollection<Project>(`${DATASETS.project.endpoint}?includeArchived=true`),
        fetchCollection<Goal>(`${DATASETS.goal.endpoint}?includeArchived=true`),
        fetchCollection<TimedAction>(`${DATASETS.timed_action.endpoint}?includeArchived=true`)
          .then((data) => ({ data, error: '' }))
          .catch((err: unknown) => ({
            data: null,
            error: err instanceof Error ? err.message : 'Failed to load actions.',
          })),
        fetchCollection<ContentHistoryEvent>('/api/history?limit=100'),
      ]);

      projects = projectData;
      goals = goalData;
      if (timedActionData.data) {
        timedActions = timedActionData.data;
      } else {
        failure = { label: 'the actions list', reason: timedActionData.error };
      }
      history = historyData;
      lastLoadedAt = new Date().toISOString();
      now = Date.now();

      if (previousSelection) {
        const exists = lists[previousSelectedDataset].some((item) => item.id === previousSelection);
        if (exists) {
          selectEntity(previousSelection, previousSelectedDataset);
        } else {
          startNew(selectedDataset, true);
        }
      }

      if (timedActionData.error) {
        setMessage(`Could not load the actions list. ${timedActionData.error}`, 'error');
      } else if (!options.quiet) {
        setMessage('Loaded latest content.', 'success');
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to load content.';
      setMessage(reason, 'error');
      failure = { label: 'content', reason };
    } finally {
      loading = false;
    }
    return failure;
  }

  async function confirmFresh(
    endpoint: string,
    kind: EditorEntity,
    loadedAt: string | undefined,
  ): Promise<boolean> {
    const res = await fetch(endpoint, { cache: 'no-store' }).catch(() => null);
    if (res === null) {
      setMessage(UNREACHABLE, 'error');
      return false;
    }
    const fresh = res.ok ? await readReturnedRecord(res) : null;
    const freshAt = fresh?.provenance?.updated_at;
    if (typeof freshAt !== 'string' || freshAt === loadedAt) {
      return true;
    }
    const who = fresh?.provenance?.updated_by ?? 'Someone';
    const consequence =
      kind === 'timed_action'
        ? 'Saving now replaces the whole action.'
        : 'Saving now overwrites the fields you changed.';
    return (
      (await confirmDialog?.ask({
        title: 'This record changed after you opened it',
        body: `${who} saved it at ${formatTimestamp(freshAt)}. ${consequence}`,
        confirmLabel: 'Save anyway',
        cancelLabel: 'Cancel',
      })) ?? false
    );
  }

  async function handleSave(request: SaveRequest) {
    if (writing || loading) {
      return;
    }
    writing = true;
    saving = true;
    serverIssue = null;
    try {
      await saveEntity(request);
    } finally {
      writing = false;
      saving = false;
    }
  }

  async function saveEntity({ mode, body }: SaveRequest) {
    const isCreate = mode === 'create';
    const targetDataset: EditorEntity = selectedDataset;
    const loadedAt = selectedEntity?.provenance?.updated_at;

    const base = DATASETS[targetDataset].endpoint;
    const endpoint = isCreate ? base : `${base}/${encodeURIComponent(selectedId)}`;
    const method = isCreate ? 'POST' : 'PATCH';

    loading = true;
    try {
      if (!isCreate && !(await confirmFresh(endpoint, targetDataset, loadedAt))) {
        return;
      }

      const res = await fetch(endpoint, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      }).catch(() => null);

      if (res === null) {
        setMessage(UNREACHABLE, 'error');
        return;
      }

      if (!res.ok) {
        const failure = await readServerError(endpoint, res);
        serverIssue = failure.issue;
        setMessage(failure.message, 'error');
        return;
      }

      const record = await readReturnedRecord(res);
      const savedId = record?.id ?? selectedId;
      if (record) {
        upsertInto[targetDataset](record);
      }

      const failure = await loadData({ quiet: true });
      if (savedId) {
        selectEntity(savedId, targetDataset);
      }
      const noun = entityNoun(targetDataset);
      const summary =
        targetDataset === 'timed_action' && selectedArchived
          ? 'Saved. This action is still archived; restore it to publish.'
          : isCreate
            ? `Created ${noun} ${savedId}.`
            : `Updated ${noun} ${savedId}.`;
      finishWrite(summary, failure);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      loading = false;
    }
  }

  const archiveBodies: Record<EditorEntity, string> = {
    project:
      'It will disappear from the public site and from the goals that link to it. You can restore it later.',
    goal: 'It will disappear from the public site, along with its actions. You can restore it later, but an action cannot be restored while its goal is archived.',
    timed_action:
      'Its banner will disappear from the public site. You can restore it until its last day has passed.',
  };

  async function archiveSelected() {
    if (!selectedId) {
      setMessage('Select an item to archive.', 'error');
      return;
    }

    if (selectedArchived) {
      setMessage(`${DATASETS[selectedDataset].title} ${selectedId} is already archived.`, 'info');
      return;
    }

    const targetDataset = selectedDataset;
    const targetId = selectedId;
    const lostChanges = editorIsDirty() ? ' Your unsaved changes will be lost.' : '';
    const proceed = await confirmDialog?.ask({
      title: `Archive ${DATASETS[targetDataset].title} ${targetId}?`,
      body: `${archiveBodies[targetDataset]}${lostChanges}`,
      confirmLabel: 'Archive',
    });
    if (!proceed) {
      return;
    }

    const base = DATASETS[targetDataset].endpoint;
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
      const record = await readReturnedRecord(res);
      if (record) {
        upsertInto[targetDataset](record);
      }
      const failure = await loadData({ quiet: true });
      selectEntity(targetId, targetDataset);
      finishWrite(`Archived ${entityNoun(targetDataset)} ${targetId}.`, failure);
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
      setMessage(`${DATASETS[selectedDataset].title} ${selectedId} is already active.`, 'info');
      return;
    }

    if (!(await confirmLeave())) {
      return;
    }

    const targetDataset = selectedDataset;
    const targetId = selectedId;
    const base = DATASETS[targetDataset].endpoint;
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
      const record = await readReturnedRecord(res);
      if (record) {
        upsertInto[targetDataset](record);
      }
      const failure = await loadData({ quiet: true });
      selectEntity(targetId, targetDataset);
      finishWrite(`Restored ${entityNoun(targetDataset)} ${targetId}.`, failure);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed.', 'error');
    } finally {
      loading = false;
    }
  }

  async function loadProfile() {
    try {
      const res = await fetch('/api/me');
      if (res.status === 401 || res.status === 503) {
        myIdentity = null;
        myActor = null;
        myDisplayName = '';
        savedDisplayName = null;
        return;
      }
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage('/api/me', res));
      }
      const payload = (await res.json()) as {
        data?: { identity?: string; actor?: string; display_name?: string | null };
      };
      const data = payload.data ?? {};
      myIdentity = typeof data.identity === 'string' ? data.identity : null;
      myActor = typeof data.actor === 'string' ? data.actor : null;
      savedDisplayName = typeof data.display_name === 'string' ? data.display_name : null;
      myDisplayName = savedDisplayName ?? '';
    } catch (err) {
      console.warn('Failed to load profile', err);
      myIdentity = null;
      myActor = null;
    }
  }

  async function saveDisplayName(next: string | null) {
    if (savingDisplayName) {
      return;
    }
    savingDisplayName = true;
    try {
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: next }),
      });
      if (!res.ok) {
        throw new Error(await toResponseErrorMessage('/api/me', res));
      }
      const payload = (await res.json()) as {
        data?: { display_name?: string | null };
      };
      const resolved = payload.data?.display_name ?? null;
      savedDisplayName = resolved;
      myDisplayName = resolved ?? '';
      setMessage(
        resolved ? `Display name set to "${resolved}".` : 'Display name cleared.',
        'success',
      );
      if (!editorIsDirty()) {
        await loadData({ quiet: true });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save display name.', 'error');
    } finally {
      savingDisplayName = false;
    }
  }

  function handleSaveDisplayName() {
    const trimmed = myDisplayName.trim();
    saveDisplayName(trimmed.length === 0 ? null : trimmed);
  }

  function handleClearDisplayName() {
    saveDisplayName(null);
  }

  onMount(() => {
    loadData();
    loadProfile();
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
          Edit projects, goals and actions. Changes go live immediately and are logged to <a
            href="/history">/history</a
          >.
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
          <button class="refresh-button" onclick={handleRefresh} disabled={loading}>Refresh</button>
        </div>

        {#if myIdentity}
          <details class="token-auth profile-auth" open>
            <summary>Profile</summary>
            <div class="token-auth-body profile-body">
              <p class="profile-actor">
                Signed in as <code>{myActor ?? myIdentity}</code>
              </p>
              <label>
                Display Name
                <input
                  bind:value={myDisplayName}
                  type="text"
                  autocomplete="off"
                  maxlength="64"
                  placeholder={myActor ?? myIdentity ?? ''}
                  disabled={savingDisplayName}
                />
                <small>
                  Replaces your email on <a href="/history">/history</a> and on entity "Updated by" fields.
                  Past entries update too. Leave blank to use your email.
                </small>
              </label>
              <div class="profile-actions">
                <button
                  type="button"
                  onclick={handleSaveDisplayName}
                  disabled={savingDisplayName || !displayNameDirty}
                >
                  {savingDisplayName ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  class="ghost"
                  onclick={handleClearDisplayName}
                  disabled={savingDisplayName || savedDisplayName === null}
                >
                  Clear
                </button>
              </div>
            </div>
          </details>
        {/if}

        <details class="token-auth">
          <summary>Token auth (optional)</summary>
          <div class="token-auth-body">
            <label>
              API token
              <input
                bind:value={token}
                type="password"
                autocomplete="current-password"
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
          {#each entityKinds as kind (kind)}
            <button
              role="tab"
              id={`tab-${kind}`}
              aria-selected={dataset === kind}
              aria-controls="content-list-panel"
              class:active={dataset === kind}
              tabindex={dataset === kind ? 0 : -1}
              onclick={() => setDataset(kind)}
              onkeydown={(event) => handleTabKeydown(event, kind)}
              disabled={loading}
            >
              {DATASETS[kind].tabLabel} ({lists[kind].length})
            </button>
          {/each}
        </div>

        <div id="content-list-panel" role="tabpanel" aria-labelledby={`tab-${dataset}`}>
          <label class="search-field">
            <span class="search-label">
              <span>Search</span>
              <span class="collection-meta">{filteredItems.length} of {activeItems.length}</span>
            </span>
            <input
              bind:value={searchQuery}
              type="text"
              autocomplete="off"
              placeholder={`Search ${entityNoun(dataset)}s by id or text`}
            />
          </label>

          <div class="list-toolbar">
            <button class="new-button" onclick={handleNew} disabled={loading}>
              + New {DATASETS[dataset].title}
            </button>
            <label class="archive-toggle">
              <input type="checkbox" bind:checked={includeArchived} />
              Include archived
            </label>
          </div>

          <ul>
            {#if filteredItems.length === 0}
              <li class="empty-state">No {entityNoun(dataset)}s match this filter.</li>
            {:else}
              {#each filteredItems as item (item.id)}
                <li class:selected={selectedDataset === dataset && selectedId === item.id}>
                  <button
                    onclick={() => handleSelect(item.id, dataset)}
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
        </div>
      </aside>

      <section class="editor-pane panel">
        {#key paneKey}
          <EditorPane
            bind:this={pane}
            kind={selectedDataset}
            title={DATASETS[selectedDataset].title}
            record={selectedRecord}
            {goals}
            {projects}
            {existingIds}
            {saving}
            {loading}
            {serverIssue}
            onsave={handleSave}
            onnochanges={() => setMessage('No changes to save.', 'info')}
            onarchive={archiveSelected}
            onrestore={restoreSelected}
            onclose={closeEditor}
          >
            {#snippet meta()}
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
                      by <span class="meta-actor"
                        >{String(selectedEntity.provenance.updated_by)}</span
                      >
                    {/if}
                  </span>
                </div>
              {/if}
            {/snippet}
          </EditorPane>
        {/key}
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
                onclick={() => {
                  if (isEditorEntity(event.entity_type)) {
                    void handleSelect(event.entity_id, event.entity_type);
                  }
                }}
                disabled={loading}
                title={`Open ${entityTypeLabel(event.entity_type).toLowerCase()} ${event.entity_id}`}
              >
                {`${entityTypeLabel(event.entity_type)}: ${event.entity_id}`}
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
  <ConfirmDialog bind:this={confirmDialog} />
</BaseLayout>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .panel {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.18);
    padding: 1.1rem;
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
    gap: 0.6rem;
    align-items: flex-end;
    min-width: 14rem;
  }

  .status-line {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
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

  .profile-body {
    grid-template-columns: 1fr;
  }

  .profile-actor {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted, #c6cbc6);
  }

  .profile-actor code {
    background: rgba(0, 0, 0, 0.28);
    padding: 0.05rem 0.3rem;
    border-radius: 0.3rem;
    font-size: 0.78rem;
  }

  .profile-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: 0.15rem;
  }

  .profile-actions button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(66, 128, 196, 0.22);
    color: inherit;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
  }

  .profile-actions button.ghost {
    background: transparent;
    color: var(--text-muted, #c6cbc6);
  }

  .profile-actions button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  input,
  button {
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

  .entity-list button {
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }

  .entity-list button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .admin-page button:focus-visible,
  .admin-page input:focus-visible,
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
    gap: 0.85rem;
  }

  #content-list-panel {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .list-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .list-actions button.active {
    border-color: rgba(66, 128, 196, 0.7);
    background: rgba(66, 128, 196, 0.22);
  }

  .list-toolbar {
    display: flex;
    gap: 0.85rem;
    align-items: center;
    flex-wrap: wrap;
    row-gap: 0.55rem;
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
    gap: 0.8rem;
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
    margin: 0 0 0.75rem;
  }

  .history-preview ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }

  .history-preview li {
    display: grid;
    grid-template-columns: 5rem minmax(12rem, 1fr) minmax(6rem, auto) minmax(6rem, auto);
    align-items: center;
    gap: 0.85rem;
    font-size: 0.82rem;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
    padding-bottom: 0.55rem;
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
