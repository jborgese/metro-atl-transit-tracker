import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './+page.svelte';

type Row = Record<string, unknown>;

interface Call {
  method: string;
  path: string;
  body: string | undefined;
}

const project = {
  id: 'p1',
  title: 'Proj One',
  summary: 's',
  status: 'planning',
  sources: [{ label: 'Plan', url: 'https://example.org/plan' }],
};
const goal = {
  id: 'g1',
  goal: 'Regional goal',
  related_project_ids: [],
  provenance: { updated_at: '2026-11-01T00:00:00Z', updated_by: 'AB' },
};
const action = {
  id: 'ta-existing',
  goal_id: 'g1',
  description: 'Existing action',
  link: null,
  location: null,
  expires_on: '2026-12-01',
};
const newAction = {
  goal_id: 'g1',
  description: 'Brand new action',
  link: null,
  location: null,
  expires_on: '2026-12-05',
};

const COLLECTIONS = ['/api/projects', '/api/goals', '/api/timed-actions'];
const UNREACHABLE = 'Could not reach the server. Your sign-in may have expired.';

const calls: Call[] = [];
const serverCopyOf: Record<string, Row> = {};
let stored: Record<string, Row[]> = {};
let writeFailure: Response | Error | null = null;
let freshnessFailure: Response | Error | null = null;
let failActionsReload = false;
let actionsGetCount = 0;
let version = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function failWritesWith(failure: Response | Error) {
  writeFailure = failure;
}

function failFreshnessCheckWith(failure: Response | Error) {
  freshnessFailure = failure;
}

function answer(failure: Response | Error): Response {
  if (failure instanceof Error) {
    throw failure;
  }
  return failure.clone();
}

function stamped(record: Row): Row {
  version += 1;
  return {
    ...record,
    provenance: { updated_at: `2026-11-14T09:00:0${version}Z`, updated_by: 'tester' },
  };
}

function replaceStored(collection: string, record: Row): Row {
  stored[collection] = (stored[collection] ?? []).map((item) =>
    item.id === record.id ? record : item,
  );
  return record;
}

function writeRecord(method: string, collection: string, id: string | undefined, body: Row) {
  const previous = (stored[collection] ?? []).find((item) => item.id === id) ?? {};
  if (method === 'POST' && id === undefined) {
    const created = stamped(
      collection === '/api/timed-actions' ? { id: 'ta-newrecord', ...body } : body,
    );
    stored[collection] = [...(stored[collection] ?? []), created];
    return json({ data: created }, 201);
  }
  if (method === 'PATCH') {
    const next =
      collection === '/api/timed-actions'
        ? { id, is_archived: previous.is_archived, ...body }
        : { ...previous, ...body };
    return json({ data: replaceStored(collection, stamped(next)) });
  }
  const archived = method === 'DELETE';
  return json({
    data: replaceStored(
      collection,
      stamped({
        ...previous,
        is_archived: archived,
        archived_at: archived ? '2026-11-14T09:30:00Z' : null,
        archived_by: archived ? 'tester' : null,
      }),
    ),
  });
}

function readRecords(collection: string, id: string | undefined) {
  const list = stored[collection] ?? [];
  if (id === undefined) {
    if (collection === '/api/timed-actions') {
      actionsGetCount += 1;
      if (failActionsReload && actionsGetCount > 1) {
        return json({ message: 'boom' }, 500);
      }
    }
    return json({ data: list });
  }
  if (freshnessFailure) {
    return answer(freshnessFailure);
  }
  const found = serverCopyOf[id] ?? list.find((item) => item.id === id);
  return found ? json({ data: found }) : json({ message: 'not found' }, 404);
}

function respond(method: string, path: string, body: string | undefined): Response {
  const [, collection = '', id] = /^(\/api\/[a-z-]+)(?:\/([^/?]+))?/.exec(path) ?? [];
  if (!COLLECTIONS.includes(collection)) {
    return method === 'GET' && path.startsWith('/api/history') ? json({ data: [] }) : json({}, 401);
  }
  if (method === 'GET') {
    return readRecords(collection, id);
  }
  if (writeFailure) {
    return answer(writeFailure);
  }
  return writeRecord(method, collection, id, JSON.parse(body ?? '{}') as Row);
}

function stubFetch() {
  calls.length = 0;
  actionsGetCount = 0;
  version = 0;
  writeFailure = null;
  freshnessFailure = null;
  for (const key of Object.keys(serverCopyOf)) {
    delete serverCopyOf[key];
  }
  stored = {
    '/api/projects': [structuredClone(project)],
    '/api/goals': [structuredClone(goal)],
    '/api/timed-actions': [structuredClone(action)],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ method, path: input, body });
      return respond(method, input, body);
    }),
  );
}

const writes = () => calls.filter((call) => call.method !== 'GET');
const lastWrite = () => writes().at(-1)!;
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const heading = () => screen.getByRole('heading', { level: 2, name: /^(New|Editing) / });
const editor = () => screen.getByLabelText('Record as JSON') as HTMLTextAreaElement;
const editorValue = () => JSON.parse(editor().value) as Row;
const status = () => screen.getByRole('status').textContent ?? '';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function renderLoaded() {
  render(AdminPage);
  await screen.findByRole('tab', { name: 'Projects (1)' });
  await screen.findByRole('tab', { name: 'Actions (1)' });
}

async function openActionsTabAndSelect(label: string) {
  await renderLoaded();
  await fireEvent.click(tab(/^Actions/));
  await fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
}

async function selectGoal(label: string) {
  await renderLoaded();
  await fireEvent.click(tab(/^Goals/));
  await fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
}

async function selectProject(label: string) {
  await renderLoaded();
  await fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
}

async function startNew(tabLabel: 'Projects' | 'Goals' | 'Actions') {
  await renderLoaded();
  await fireEvent.click(tab(new RegExp(`^${tabLabel}`)));
  await fireEvent.click(screen.getByRole('button', { name: /^\+ New / }));
}

async function typeIntoEditor(value: string) {
  await fireEvent.input(editor(), { target: { value } });
}

async function editGoalActions(text: string) {
  await typeIntoEditor(JSON.stringify({ ...editorValue(), actions: text }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  failActionsReload = false;
  stubFetch();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('admin page editor target', () => {
  it('creates an action through /api/timed-actions even after visiting another tab', async () => {
    await renderLoaded();
    await fireEvent.click(tab(/^Actions/));
    await fireEvent.click(screen.getByRole('button', { name: '+ New Action' }));
    await fireEvent.click(tab(/^Goals/));

    expect(heading().textContent?.trim()).toBe('New Action');
    expect(screen.getByRole('button', { name: 'Create Action' })).toBeTruthy();

    await typeIntoEditor(JSON.stringify(newAction));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/timed-actions' });
    expect(JSON.parse(lastWrite().body!)).toEqual(newAction);
  });

  it('saves a selected goal to /api/goals even when the Actions tab is showing', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(tab(/^Actions/));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/goals/g1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({ actions: 'Mine' });
  });

  it('saves a selected project to /api/projects', async () => {
    await selectProject('Proj One');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), title: 'Proj Two' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/projects/p1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({ title: 'Proj Two' });
  });

  it('selects the saved record when the actions reload fails, and says so', async () => {
    failActionsReload = true;
    await startNew('Actions');
    await typeIntoEditor(JSON.stringify(newAction));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));

    await waitFor(() => expect(status()).toContain('reloaded'));
    expect(status()).toContain('could not be reloaded');
    expect(heading().textContent).toContain('ta-newrecord');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create Action' })).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(lastWrite().body!)).toEqual(newAction);
  });

  it('shows the new-record template of the tab clicked when the editor is clean and empty', async () => {
    await renderLoaded();
    expect(heading().textContent?.trim()).toBe('New Project');
    await fireEvent.click(tab(/^Actions/));
    expect(heading().textContent?.trim()).toBe('New Action');
    expect(editorValue()).toEqual({
      goal_id: '',
      description: '',
      link: null,
      location: null,
      expires_on: '',
    });
  });

  it('only changes the list when a record is selected or the editor is dirty', async () => {
    await renderLoaded();
    await fireEvent.click(screen.getByText('Proj One'));
    await fireEvent.click(tab(/^Actions/));
    expect(heading().textContent).toContain('Editing Project p1');

    await fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await fireEvent.click(tab(/^Projects/));
    await typeIntoEditor('{}');
    await fireEvent.click(tab(/^Goals/));
    expect(heading().textContent?.trim()).toBe('New Project');
  });

  it('archives the selected record even when another tab is showing', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Archive Goal g1?');
    expect(within(dialog).getByText(/along with its actions/)).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(writes()).toEqual([{ method: 'DELETE', path: '/api/goals/g1' }]));
  });
});

describe('leaving a record', () => {
  it('asks before discarding changes when another record is clicked', async () => {
    await openActionsTabAndSelect('Existing action');
    await typeIntoEditor('{}');
    await fireEvent.click(screen.getByRole('tab', { name: /Goals/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true);
    expect(screen.getByText('Discard your changes to Action ta-existing?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'Editing Action ta-existing' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('heading', { name: 'Editing Goal g1' })).toBeTruthy();
  });

  it('names a new record in the prompt', async () => {
    await startNew('Projects');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), id: 'typed-id' }));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true);
    expect(screen.getByText('Discard your changes to this new project?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(heading().textContent?.trim()).toBe('New Project');
    expect(editorValue().id).toBe('typed-id');

    await fireEvent.click(screen.getByRole('button', { name: '+ New Project' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(editorValue().id).toBe('');
  });

  it('puts back the stored record when the same record is reopened', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(editorValue()).toEqual({ goal: 'Regional goal', related_project_ids: [] });
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(heading().textContent?.trim()).toBe('Editing Project p1');
  });

  it('puts back the stored record when Refresh discards the draft', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByText('Discard your changes to Goal g1?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect(calls.filter((call) => call.path.startsWith('/api/history'))).toHaveLength(2),
    );
    await waitFor(() =>
      expect(editorValue()).toEqual({ goal: 'Regional goal', related_project_ids: [] }),
    );
    expect(heading().textContent?.trim()).toBe('Editing Goal g1');
  });

  it('asks before leaving text that does not parse, and refuses to save it', async () => {
    await selectGoal('Regional goal');
    await typeIntoEditor('{"goal": ');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    const summary = screen.getByRole('alert');
    expect(within(summary).getByText('There is a problem')).toBeTruthy();
    expect(within(summary).getByText(/^The JSON does not parse: /)).toBeTruthy();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(calls.filter((call) => call.path === '/api/goals/g1')).toHaveLength(0);

    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true);
    expect(screen.getByText('Discard your changes to Goal g1?')).toBeTruthy();
  });
});

describe('archive and restore', () => {
  it('archives only after the dialog is confirmed, and says what archiving a goal does', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(screen.getByText(/along with its actions/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    await fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }),
    );
    await waitFor(() => expect(writes()).toEqual([{ method: 'DELETE', path: '/api/goals/g1' }]));
  });

  it.each([
    [
      'Projects',
      /Proj One/,
      'Archive Project p1?',
      'It will disappear from the public site and from the goals that link to it. You can restore it later.',
    ],
    [
      'Actions',
      /Existing action/,
      'Archive Action ta-existing?',
      'Its banner will disappear from the public site. You can restore it until its last day has passed.',
    ],
  ])(
    'says what archiving does on %s and sends nothing when cancelled',
    async (tabLabel, record, title, body) => {
      await renderLoaded();
      await fireEvent.click(tab(new RegExp(`^${tabLabel}`)));
      await fireEvent.click(screen.getByRole('button', { name: record }));
      await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByRole('heading').textContent).toBe(title);
      expect(within(dialog).getByText(body)).toBeTruthy();
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await settle();
      expect(dialog).toHaveProperty('open', false);
      expect(writes()).toHaveLength(0);
    },
  );

  it('says unsaved changes will be lost when archiving an edited record', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(
      within(screen.getByRole('alertdialog')).getByText(
        'It will disappear from the public site, along with its actions. You can restore it later, but an action cannot be restored while its goal is archived. Your unsaved changes will be lost.',
      ),
    ).toBeTruthy();
  });

  it('asks before restoring over unsaved changes', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }),
    );
    await waitFor(() => expect(status()).toContain('Archived goal g1.'));
    await editGoalActions('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Discard your changes to Goal g1?',
    );
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await settle();
    expect(writes()).toEqual([{ method: 'DELETE', path: '/api/goals/g1' }]);
    expect(editorValue().actions).toBe('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(lastWrite()).toEqual({ method: 'POST', path: '/api/goals/g1/restore' });
  });
});

describe('record tabs', () => {
  it('moves between the record tabs with the arrow keys', async () => {
    await renderLoaded();
    const projectsTab = screen.getByRole('tab', { name: /Projects/ });
    projectsTab.focus();
    await fireEvent.keyDown(projectsTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Goals/ }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Goals/ }));
    await fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: /Actions/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('wraps from the first tab to the last and keeps one tab in the tab order', async () => {
    await renderLoaded();
    tab(/^Projects/).focus();
    await fireEvent.keyDown(tab(/^Projects/), { key: 'ArrowLeft' });
    expect(tab(/^Actions/).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(/^Actions/));
    expect(
      screen.getAllByRole('tab').filter((item) => item.getAttribute('tabindex') === '0'),
    ).toEqual([tab(/^Actions/)]);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey'])('leaves an arrow key with %s alone', async (key) => {
    await renderLoaded();
    tab(/^Projects/).focus();
    const notCancelled = await fireEvent.keyDown(tab(/^Projects/), {
      key: 'ArrowLeft',
      [key]: true,
    });
    expect(notCancelled).toBe(true);
    expect(tab(/^Projects/).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(/^Projects/));
  });
});

describe('saving', () => {
  it('sends nothing when nothing changed', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('No changes to save.');
  });
  it('sends only the changed key of a goal', async () => {
    await selectGoal('Regional goal');
    await typeIntoEditor(
      JSON.stringify({ goal: 'Regional goal', related_project_ids: [], actions: 'Write in' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({ actions: 'Write in' });
  });
  it('warns that a deleted key will be kept', async () => {
    await selectProject('Proj One');
    await typeIntoEditor(JSON.stringify({ title: 'Proj One', status: 'planning' }));
    expect(
      screen.getByText("summary can't be removed through the API; it will keep its stored value."),
    ).toBeTruthy();
  });
  it('lists problems instead of sending them', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    expect(writes()).toHaveLength(0);
    const summary = screen.getByRole('alert');
    expect(within(summary).getByText('There is a problem')).toBeTruthy();
    expect(within(summary).getByText('Choose a goal')).toBeTruthy();
    expect(within(summary).getByText('Enter a description')).toBeTruthy();
  });
  it('asks before overwriting a record someone else just saved', async () => {
    serverCopyOf.g1 = {
      ...goal,
      provenance: { updated_at: '2026-11-14T10:00:00Z', updated_by: 'JT' },
    };
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.getByText('This record changed after you opened it')).toBeTruthy(),
    );
    expect(writes()).toHaveLength(0);
    await fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
  });
  it('sends one request for a double click', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    const save = screen.getByRole('button', { name: 'Save Changes' });
    await Promise.all([fireEvent.click(save), fireEvent.click(save)]);
    await waitFor(() => expect(writes()).toHaveLength(1));
  });
  it('keeps the draft and explains when the server cannot be reached', async () => {
    failWritesWith(new TypeError('Failed to fetch'));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Could not reach the server. Your sign-in may have expired.',
      ),
    );
    expect(
      JSON.parse((screen.getByLabelText('Record as JSON') as HTMLTextAreaElement).value).actions,
    ).toBe('Mine');
  });
  it('shows the message from a rate-limit response', async () => {
    failWritesWith(json({ error: 'Too many writes' }, 429));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        '/api/goals/g1 returned 429: Too many writes',
      ),
    );
  });

  it('replaces an action with exactly its five fields', async () => {
    await openActionsTabAndSelect('Existing action');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), description: 'Changed action' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/timed-actions/ta-existing' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Changed action',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
    const [, init] = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === 'PATCH')!;
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-editor-actor': 'admin',
    });
  });

  it('sends only sources after one source label changes', async () => {
    await selectProject('Proj One');
    await typeIntoEditor(
      JSON.stringify({
        ...editorValue(),
        sources: [{ label: 'Plan v2', url: 'https://example.org/plan' }],
      }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/projects/p1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      sources: [{ label: 'Plan v2', url: 'https://example.org/plan' }],
    });
  });

  it('creates a project with the id typed in the JSON and no server-managed keys', async () => {
    await startNew('Projects');
    expect(editorValue().id).toBe('');
    await typeIntoEditor(
      JSON.stringify({
        ...editorValue(),
        id: 'new-one',
        title: 'New project',
        provenance: { updated_by: 'forged' },
        is_archived: true,
        archived_at: null,
        archived_by: 'someone',
      }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/projects' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      id: 'new-one',
      title: 'New project',
      summary: '',
      status: 'planning',
      modes: [],
      related_counties: [],
      sources: [],
    });
    await waitFor(() => expect(heading().textContent?.trim()).toBe('Editing Project new-one'));
  });

  it('says a key the form does not know will be stored for good', async () => {
    await selectGoal('Regional goal');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), notes: 'x', extra: 1 }));
    expect(
      screen.getByText(
        'notes, extra will be stored but shown nowhere, and cannot be removed later.',
      ),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({ notes: 'x', extra: 1 });
  });

  it('refuses a new project whose id is already used', async () => {
    await startNew('Projects');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), id: 'p1', title: 'Copy' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    expect(
      within(screen.getByRole('alert')).getByText(
        'A project with this id already exists, including archived ones',
      ),
    ).toBeTruthy();
    await settle();
    expect(writes()).toHaveLength(0);
  });

  it('is clean after a successful save', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    expect(editorValue().actions).toBe('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(status()).toContain('No changes to save.');
    expect(writes()).toHaveLength(1);

    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(heading().textContent?.trim()).toBe('Editing Project p1');
  });

  it('shows a field error from the server and clears it on the next edit', async () => {
    failWritesWith(
      json({ message: 'project validation failed - sources.0.url: Invalid URL' }, 400),
    );
    await selectProject('Proj One');
    await typeIntoEditor(
      JSON.stringify({
        ...editorValue(),
        sources: [{ label: 'Plan v2', url: 'https://example.org/plan' }],
      }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(
      within(screen.getByRole('alert')).getByText('Source 1 web address: Invalid URL'),
    ).toBeTruthy();
    expect(status()).toContain(
      '/api/projects/p1 returned 400: project validation failed - sources.0.url: Invalid URL',
    );
    expect(editorValue().sources).toEqual([{ label: 'Plan v2', url: 'https://example.org/plan' }]);

    await typeIntoEditor(JSON.stringify({ ...editorValue(), title: 'Proj Two' }));
    expect(screen.queryByText('Source 1 web address: Invalid URL')).toBeNull();
  });

  it('reformats the text without changing the record', async () => {
    await selectGoal('Regional goal');
    await typeIntoEditor('{"goal":"Regional goal","related_project_ids":[]}');
    await fireEvent.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(editor().value).toBe('{\n  "goal": "Regional goal",\n  "related_project_ids": []\n}\n');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(status()).toContain('No changes to save.');
  });
});

describe('freshness check before an update', () => {
  it('saves without asking when nobody else saved', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    const before = calls.length;
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(calls.slice(before, before + 2)).toEqual([
      { method: 'GET', path: '/api/goals/g1', body: undefined },
      { method: 'PATCH', path: '/api/goals/g1', body: JSON.stringify({ actions: 'Mine' }) },
    ]);
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('keeps the draft and sends nothing when the editor cancels', async () => {
    serverCopyOf.g1 = {
      ...goal,
      provenance: { updated_at: '2026-11-14T10:00:00Z', updated_by: 'JT' },
    };
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    const text = editor().value;
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.getByText('This record changed after you opened it')).toBeTruthy(),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(
        `JT saved it at ${new Date('2026-11-14T10:00:00Z').toLocaleString()}. Saving now overwrites the fields you changed.`,
      ),
    ).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(editor().value).toBe(text);
    expect(heading().textContent?.trim()).toBe('Editing Goal g1');
  });

  it('says an action save replaces the whole action', async () => {
    serverCopyOf['ta-existing'] = {
      ...action,
      provenance: { updated_at: '2026-11-14T10:00:00Z', updated_by: 'JT' },
    };
    await openActionsTabAndSelect('Existing action');
    await typeIntoEditor(JSON.stringify({ ...editorValue(), description: 'Changed action' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.getByText('This record changed after you opened it')).toBeTruthy(),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(
        `JT saved it at ${new Date('2026-11-14T10:00:00Z').toLocaleString()}. Saving now replaces the whole action.`,
      ),
    ).toBeTruthy();
  });

  it('sends nothing when the record cannot be checked', async () => {
    failFreshnessCheckWith(new TypeError('Failed to fetch'));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(status()).toContain(UNREACHABLE));
    expect(writes()).toHaveLength(0);
    expect(editorValue().actions).toBe('Mine');
  });

  it('lets the write report its own error when the check gets an error response', async () => {
    failFreshnessCheckWith(json({ message: 'boom' }, 500));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toEqual({
      method: 'PATCH',
      path: '/api/goals/g1',
      body: JSON.stringify({ actions: 'Mine' }),
    });
  });
});
