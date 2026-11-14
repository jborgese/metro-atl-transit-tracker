import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import liveGoals from '../../lib/content/formModel/fixtures/live-goals.json';
import liveProjects from '../../lib/content/formModel/fixtures/live-projects.json';
import liveActions from '../../lib/content/formModel/fixtures/live-timed-actions.json';
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
let writeGate: Promise<void> | null = null;
let readGate: Promise<void> | null = null;
let profile: Row | null = null;

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

function answerProfile(method: string, body: string | undefined): Response {
  if (method === 'GET') {
    return profile ? json({ data: profile }) : json({}, 401);
  }
  const { display_name } = JSON.parse(body ?? '{}') as Row;
  return json({ data: { ...profile, display_name } });
}

function respond(method: string, path: string, body: string | undefined): Response {
  const [, collection = '', id] = /^(\/api\/[a-z-]+)(?:\/([^/?]+))?/.exec(path) ?? [];
  if (collection === '/api/me') {
    return answerProfile(method, body);
  }
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
  writeGate = null;
  readGate = null;
  profile = null;
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
      if (method !== 'GET' && writeGate) {
        await writeGate;
      }
      if (method === 'GET' && readGate) {
        await readGate;
      }
      return respond(method, input, body);
    }),
  );
}

const writes = () => calls.filter((call) => call.method !== 'GET');
const lastWrite = () => writes().at(-1)!;
const reads = (path: string) => calls.filter((call) => call.method === 'GET' && call.path === path);
const listReloads = () => calls.filter((call) => call.path.startsWith('/api/history'));
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const heading = () => screen.getByRole('heading', { level: 2, name: /^(New|Editing) / });
const editor = () => screen.getByLabelText('Record as JSON') as HTMLTextAreaElement;
const editorValue = () => JSON.parse(editor().value) as Row;
const status = () =>
  screen.getAllByRole('status').find((node) => node.closest('form') === null)?.textContent ?? '';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const dialogOpen = () => document.querySelector('dialog')?.open === true;
const summaryLinks = () =>
  within(screen.getByRole('alert'))
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);

async function renderLoaded() {
  render(AdminPage);
  await screen.findByRole('tab', { name: `Projects (${stored['/api/projects']?.length ?? 0})` });
  await screen.findByRole('tab', {
    name: `Actions (${stored['/api/timed-actions']?.length ?? 0})`,
  });
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

async function asJson() {
  await fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON (advanced)' }));
}

async function typeIntoEditor(value: string) {
  await fireEvent.input(editor(), { target: { value } });
}

async function editLabelled(label: string, value: string) {
  await fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

async function editGoalActions(text: string) {
  await editLabelled('Ongoing actions', text);
}

async function editJsonActions(text: string) {
  await typeIntoEditor(JSON.stringify({ ...editorValue(), actions: text }));
}

async function save() {
  const before = writes().length;
  await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(writes()).toHaveLength(before + 1));
}

async function attemptSave() {
  await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await settle();
}

async function addRow(itemName: 'partner' | 'milestone' | 'source') {
  const first = screen.queryByRole('button', { name: `Add a ${itemName}` });
  await fireEvent.click(first ?? screen.getByRole('button', { name: `Add another ${itemName}` }));
  const noun = itemName.charAt(0).toUpperCase() + itemName.slice(1);
  return screen.getAllByRole('group', { name: new RegExp(`^${noun} \\d+$`) }).at(-1)!;
}

async function editIn(row: HTMLElement, label: string, value: string) {
  await fireEvent.input(within(row).getByLabelText(label), { target: { value } });
}

async function addSource({
  label,
  url,
  lastVerified,
}: {
  label?: string;
  url?: string;
  lastVerified?: string;
}) {
  const row = await addRow('source');
  if (label !== undefined) {
    await editIn(row, 'Label (required)', label);
  }
  if (url !== undefined) {
    await editIn(row, 'Web address (required)', url);
  }
  if (lastVerified !== undefined) {
    await editIn(row, 'Last verified', lastVerified);
  }
}

async function fillAction({ description, lastDay }: { description: string; lastDay: string }) {
  await editLabelled('Description (required)', description);
  await editLabelled('Last day (required)', lastDay);
}

const ongoingActions = () =>
  (screen.getByLabelText('Ongoing actions') as HTMLTextAreaElement).value;

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

    await asJson();
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
    await editLabelled('Title (required)', 'Proj Two');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/projects/p1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({ title: 'Proj Two' });
  });

  it('selects the saved record when the actions reload fails, and says so', async () => {
    failActionsReload = true;
    await startNew('Actions');
    await asJson();
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
    await asJson();
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
    await editLabelled('Title (required)', 'Draft title');
    await fireEvent.click(tab(/^Goals/));
    expect(heading().textContent?.trim()).toBe('New Project');
    expect((screen.getByLabelText('Title (required)') as HTMLInputElement).value).toBe(
      'Draft title',
    );
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
    await asJson();
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
    const typedId = () => (screen.getByLabelText('Id (required)') as HTMLInputElement).value;
    await startNew('Projects');
    await editLabelled('Id (required)', 'typed-id');
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true);
    expect(screen.getByText('Discard your changes to this new project?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(heading().textContent?.trim()).toBe('New Project');
    expect(typedId()).toBe('typed-id');

    await fireEvent.click(screen.getByRole('button', { name: '+ New Project' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(typedId()).toBe('');
  });

  it('puts back the stored record when the same record is reopened', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(ongoingActions()).toBe('');
    await asJson();
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
    await waitFor(() => expect(listReloads()).toHaveLength(2));
    await waitFor(() => expect(ongoingActions()).toBe(''));
    await asJson();
    expect(editorValue()).toEqual({ goal: 'Regional goal', related_project_ids: [] });
    expect(heading().textContent?.trim()).toBe('Editing Goal g1');
  });

  it('asks before leaving text that does not parse, and refuses to save it', async () => {
    await selectGoal('Regional goal');
    await asJson();
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
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Editing Goal g1' })),
    );
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
    expect(ongoingActions()).toBe('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(lastWrite()).toEqual({ method: 'POST', path: '/api/goals/g1/restore' });
    await waitFor(() => expect(status()).toContain('Restored goal g1.'));
    await waitFor(() => expect(document.activeElement).toBe(heading()));
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
    await settle();
    expect(writes()).toHaveLength(0);
    expect(reads('/api/goals/g1')).toHaveLength(0);
    expect(status()).toContain('No changes to save.');
  });
  it('sends only the changed key of a goal', async () => {
    await selectGoal('Regional goal');
    await asJson();
    await typeIntoEditor(
      JSON.stringify({ goal: 'Regional goal', related_project_ids: [], actions: 'Write in' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({ actions: 'Write in' });
  });
  it('warns that a deleted key will be kept', async () => {
    await selectProject('Proj One');
    await asJson();
    await typeIntoEditor(JSON.stringify({ title: 'Proj One', status: 'planning' }));
    expect(
      screen.getByText("summary can't be removed through the API; it will keep its stored value."),
    ).toBeTruthy();
  });
  it('lists problems instead of sending them', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await settle();
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
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    await settle();
    expect(writes()).toHaveLength(1);
    expect(reads('/api/goals/g1')).toHaveLength(1);
  });
  it('keeps the draft and explains when the server cannot be reached', async () => {
    failWritesWith(new TypeError('Failed to fetch'));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(status()).toContain('Could not reach the server. Your sign-in may have expired.'),
    );
    expect(ongoingActions()).toBe('Mine');
  });
  it('shows the message from a rate-limit response', async () => {
    failWritesWith(json({ error: 'Too many writes' }, 429));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(status()).toContain('/api/goals/g1 returned 429: Too many writes'));
  });

  it('replaces an action with exactly its five fields', async () => {
    await openActionsTabAndSelect('Existing action');
    await asJson();
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
    await editIn(screen.getByRole('group', { name: 'Source 1' }), 'Label (required)', 'Plan v2');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/projects/p1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      sources: [{ label: 'Plan v2', url: 'https://example.org/plan' }],
    });
  });

  it('creates a project with the id typed in the JSON and no server-managed keys', async () => {
    await startNew('Projects');
    await asJson();
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
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });

  it('says a key the form does not know will be stored for good', async () => {
    await selectGoal('Regional goal');
    await asJson();
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
    await asJson();
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

  it('reads Saving… while a save is in flight and stays enabled', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button.hasAttribute('disabled')).toBe(false);
    release();
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
  });

  it('is clean after a successful save', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    expect(ongoingActions()).toBe('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(status()).toContain('No changes to save.');
    expect(writes()).toHaveLength(1);
    expect(reads('/api/goals/g1')).toHaveLength(1);

    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(heading().textContent?.trim()).toBe('Editing Project p1');
  });

  it('shows a field error from the server and clears it on the next edit', async () => {
    failWritesWith(
      json({ message: 'project validation failed - sources.0.url: Invalid URL' }, 400),
    );
    await selectProject('Proj One');
    await asJson();
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
    expect(screen.getByText('Source 1 web address: Invalid URL')).toBeTruthy();

    await typeIntoEditor(
      JSON.stringify({
        ...editorValue(),
        sources: [{ label: 'Plan v2', url: 'https://example.org/plan-v2' }],
      }),
    );
    expect(screen.queryByText('Source 1 web address: Invalid URL')).toBeNull();
  });

  it('reformats the text without changing the record', async () => {
    await selectGoal('Regional goal');
    await asJson();
    await typeIntoEditor('{"goal":"Regional goal","related_project_ids":[]}');
    await fireEvent.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(editor().value).toBe('{\n  "goal": "Regional goal",\n  "related_project_ids": []\n}\n');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(status()).toContain('No changes to save.');
  });

  it('keeps a row problem while other JSON text is edited, until the row is fixed', async () => {
    await selectProject('Proj One');
    await asJson();
    const broken = [{ label: 'Plan', url: 'not a web address' }];
    await typeIntoEditor(JSON.stringify({ ...editorValue(), sources: broken }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    const problem = 'Source 1 web address: enter a full web address starting with https://';
    expect(within(screen.getByRole('alert')).getByText(problem)).toBeTruthy();

    await typeIntoEditor(JSON.stringify({ ...editorValue(), title: 'Proj Two' }));
    expect(within(screen.getByRole('alert')).getByText(problem)).toBeTruthy();

    await typeIntoEditor(
      JSON.stringify({ ...editorValue(), sources: [{ label: 'Plan', url: 'https://ok.example' }] }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
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
    await asJson();
    await editJsonActions('Mine');
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
    await asJson();
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
    expect(ongoingActions()).toBe('Mine');
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

describe('action form', () => {
  const summary = () => screen.getByRole('alert');
  const field = (label: string) => screen.getByLabelText(label);

  it('creates an action from the form', async () => {
    await startNew('Actions');
    await fireEvent.change(screen.getByLabelText('Goal (required)'), { target: { value: 'g1' } });
    await fireEvent.input(screen.getByLabelText('Description (required)'), {
      target: { value: 'Brand new action' },
    });
    await fireEvent.input(screen.getByLabelText('Last day (required)'), {
      target: { value: '2026-12-05' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/timed-actions' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Brand new action',
      link: null,
      location: null,
      expires_on: '2026-12-05',
    });
  });

  it('focuses the summary and clears an error once it is fixed', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    const description = screen.getByLabelText('Description (required)');
    expect(description.getAttribute('aria-invalid')).toBe('true');
    await fireEvent.input(description, { target: { value: 'Now filled' } });
    expect(description.hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByText('Enter a description')).toBeNull();
  });

  it('carries edits between the form and the JSON view', async () => {
    await startNew('Actions');
    await fireEvent.input(screen.getByLabelText('Description (required)'), {
      target: { value: 'From the form' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON (advanced)' }));
    expect(
      JSON.parse((screen.getByLabelText('Record as JSON') as HTMLTextAreaElement).value)
        .description,
    ).toBe('From the form');
    await typeIntoEditor('{');
    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(screen.getByText(/^The JSON does not parse/)).toBeTruthy();
    expect(screen.queryByLabelText('Description (required)')).toBeNull();
  });

  it('comes back to the form with the JSON edits when the JSON parses', async () => {
    await startNew('Actions');
    await asJson();
    await typeIntoEditor(JSON.stringify(newAction));
    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect((field('Description (required)') as HTMLTextAreaElement).value).toBe('Brand new action');
    expect((field('Goal (required)') as HTMLSelectElement).value).toBe('g1');
  });

  it('opens an untouched action clean, sends nothing, and stays clean across view switches', async () => {
    await openActionsTabAndSelect('Existing action');
    expect((field('Description (required)') as HTMLTextAreaElement).value).toBe('Existing action');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await asJson();
    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(status()).toContain('No changes to save.');
  });

  it('updates an existing action from the form with its five fields', async () => {
    await openActionsTabAndSelect('Existing action');
    await fireEvent.input(field('Description (required)'), { target: { value: 'Edited here' } });
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/timed-actions/ta-existing' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Edited here',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
  });

  it('reports a half-filled link at the web address and sends nothing', async () => {
    await openActionsTabAndSelect('Existing action');
    await fireEvent.input(field('Link button label'), { target: { value: 'Comment' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(reads('/api/timed-actions/ta-existing')).toHaveLength(0);
    expect(field('Link web address').getAttribute('aria-invalid')).toBe('true');
    expect(within(summary()).getAllByRole('link')).toHaveLength(1);
    expect(within(summary()).getByRole('link').getAttribute('href')).toBe('#action-link-url');
  });

  it('sends link: null when both link fields of an action that had a link are cleared', async () => {
    stored['/api/timed-actions'] = [
      { ...action, link: { label: 'Comment', url: 'https://example.org/comment' } },
    ];
    await openActionsTabAndSelect('Existing action');
    expect((field('Link button label') as HTMLInputElement).value).toBe('Comment');
    await fireEvent.input(field('Link button label'), { target: { value: '' } });
    await fireEvent.input(field('Link web address'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Existing action',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
  });

  it('links each problem to its field, and a click focuses it', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    const links = within(summary()).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href')).sort()).toEqual([
      '#action-description',
      '#action-expires_on',
      '#action-goal_id',
    ]);
    const goalLink = links.find((link) => link.getAttribute('href') === '#action-goal_id')!;
    await fireEvent.click(goalLink);
    expect(document.activeElement).toBe(field('Goal (required)'));
  });

  it('keeps a problem while its field is still invalid and updates the message', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    expect(within(summary()).getAllByRole('link')).toHaveLength(3);

    await fireEvent.input(field('Description (required)'), { target: { value: 'Filled' } });
    expect(within(summary()).queryByText('Enter a description')).toBeNull();
    expect(within(summary()).getAllByRole('link')).toHaveLength(2);

    expect(within(summary()).getByText('Choose a last day')).toBeTruthy();
    await fireEvent.input(field('Last day (required)'), { target: { value: '2020-01-01' } });
    expect(within(summary()).getAllByRole('link')).toHaveLength(2);
    expect(within(summary()).queryByText('Choose a last day')).toBeNull();
    expect(within(summary()).getByText(/^Last day /)).toBeTruthy();
    expect(field('Last day (required)').getAttribute('aria-invalid')).toBe('true');
  });

  it('stays in the JSON view after a save re-creates the pane', async () => {
    await openActionsTabAndSelect('Existing action');
    await asJson();
    await typeIntoEditor(JSON.stringify({ ...editorValue(), description: 'Changed in JSON' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(status()).toContain('Updated'));
    await settle();
    expect(screen.getByRole('button', { name: 'Back to form' })).toBeTruthy();
    expect(editor().value).toContain('Changed in JSON');
    expect(screen.queryByLabelText('Description (required)')).toBeNull();
  });

  it('opens every record type in its form, with the switch to JSON', async () => {
    await selectProject('Proj One');
    expect(screen.getByRole('button', { name: 'Edit as JSON (advanced)' })).toBeTruthy();
    expect(screen.queryByLabelText('Record as JSON')).toBeNull();
    expect((field('Title (required)') as HTMLInputElement).value).toBe('Proj One');
    await asJson();
    expect(editorValue().title).toBe('Proj One');
    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    await fireEvent.click(tab(/^Goals/));
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    expect(screen.getByRole('button', { name: 'Edit as JSON (advanced)' })).toBeTruthy();
    expect(screen.queryByLabelText('Record as JSON')).toBeNull();
    expect((field('Goal (required)') as HTMLTextAreaElement).value).toBe('Regional goal');
  });

  it('still asks before leaving a form edit', async () => {
    await openActionsTabAndSelect('Existing action');
    await fireEvent.input(field('Description (required)'), { target: { value: 'Edited' } });
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true);
    expect(screen.getByText('Discard your changes to Action ta-existing?')).toBeTruthy();
  });

  it('disables the form while a save is in flight', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openActionsTabAndSelect('Existing action');
    const description = field('Description (required)') as HTMLTextAreaElement;
    expect(description.disabled).toBe(false);
    await fireEvent.input(description, { target: { value: 'Edited' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(description.matches(':disabled')).toBe(true);
    expect(field('Goal (required)').matches(':disabled')).toBe(true);
    release();
    await waitFor(() => expect(status()).toContain('Updated'));
    await settle();
    expect((field('Description (required)') as HTMLTextAreaElement).matches(':disabled')).toBe(
      false,
    );
  });
});

describe('action form after review', () => {
  const summary = () => screen.getByRole('alert');
  const field = (label: string) => screen.getByLabelText(label);

  async function openStored(overrides: Row, goals?: Row[]) {
    stored['/api/timed-actions'] = [{ ...action, ...overrides }];
    if (goals) {
      stored['/api/goals'] = goals;
    }
    await openActionsTabAndSelect('Existing action');
  }

  async function saveDescriptionOnly(expected: Row) {
    await fireEvent.input(field('Description (required)'), { target: { value: 'Edited only' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Edited only',
      link: null,
      location: null,
      expires_on: '2026-12-01',
      ...expected,
    });
  }

  it('checks the last day against the date at Save, not the date the form opened', async () => {
    vi.setSystemTime(new Date('2026-11-15T04:59:00Z'));
    await startNew('Actions');
    await fireEvent.change(field('Goal (required)'), { target: { value: 'g1' } });
    await fireEvent.input(field('Description (required)'), { target: { value: 'Late' } });
    await fireEvent.input(field('Last day (required)'), { target: { value: '2026-11-14' } });
    expect((field('Last day (required)') as HTMLInputElement).min).toBe('2026-11-14');

    vi.setSystemTime(new Date('2026-11-15T05:01:00Z'));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(
      within(summary()).getByText('Last day must be between 2026-11-15 and 2027-11-16'),
    ).toBeTruthy();
    expect(field('Last day (required)').getAttribute('aria-invalid')).toBe('true');
    expect((field('Last day (required)') as HTMLInputElement).min).toBe('2026-11-15');
    expect((field('Last day (required)') as HTMLInputElement).max).toBe('2027-11-16');
    expect(screen.getByText(/From 2026-11-15 to 2027-11-16\.$/)).toBeTruthy();
  });

  it('forgets a fixed problem until the next Save', async () => {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    const description = field('Description (required)');
    await fireEvent.input(description, { target: { value: 'Fixed' } });
    expect(screen.queryByText('Enter a description')).toBeNull();

    await fireEvent.input(description, { target: { value: '' } });
    expect(screen.queryByText('Enter a description')).toBeNull();
    expect(description.hasAttribute('aria-invalid')).toBe(false);
    expect(within(summary()).getAllByRole('link')).toHaveLength(2);

    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    expect(within(summary()).getByText('Enter a description')).toBeTruthy();
    expect(description.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a JSON error in the summary only as captured by a Save', async () => {
    await startNew('Actions');
    await asJson();
    await typeIntoEditor('{');
    expect(screen.getByText(/^The JSON does not parse/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    const captured = within(summary()).getByText(/^The JSON does not parse/).textContent;
    expect(document.activeElement).toBe(summary());

    await typeIntoEditor('{ "a"');
    expect(within(summary()).getByText(/^The JSON does not parse/).textContent).toBe(captured);

    await typeIntoEditor(JSON.stringify(newAction));
    expect(screen.queryByRole('alert')).toBeNull();
    await typeIntoEditor('{ "b"');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/^The JSON does not parse/)).toBeTruthy();
  });

  it('keeps an archived stored goal, clean, and saves a description edit with it', async () => {
    await openStored({ goal_id: 'g2' }, [
      structuredClone(goal),
      { id: 'g2', goal: 'Old goal', is_archived: true },
    ]);
    const select = field('Goal (required)') as HTMLSelectElement;
    expect(select.value).toBe('g2');
    expect(select.selectedOptions[0]!.textContent).toBe('Old goal (g2) (archived)');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    await saveDescriptionOnly({ goal_id: 'g2' });
  });

  it('keeps a stored goal that matches nothing, clean, and saves a description edit with it', async () => {
    await openStored({ goal_id: 'zz' });
    const select = field('Goal (required)') as HTMLSelectElement;
    expect(select.value).toBe('zz');
    expect(select.selectedOptions[0]!.textContent).toBe('zz (not found)');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    await saveDescriptionOnly({ goal_id: 'zz' });
  });

  it.each([['2026-11-01'], ['2028-06-01']])(
    'keeps the stored last day %s and saves a description edit without a date problem',
    async (date) => {
      await openStored({ expires_on: date });
      expect((field('Last day (required)') as HTMLInputElement).value).toBe(date);
      await saveDescriptionOnly({ expires_on: date });
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('sends location: null when both location fields are cleared', async () => {
    await openStored({ location: { label: 'Map', address: '1 Main St' } });
    expect((field('Address') as HTMLInputElement).value).toBe('1 Main St');
    await fireEvent.input(field('Location button label'), { target: { value: '' } });
    await fireEvent.input(field('Address'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Existing action',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
  });
});

describe('keeping drafts and focus', () => {
  it('makes the text read-only while a save is in flight', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await selectGoal('Regional goal');
    await asJson();
    expect(editor().hasAttribute('readonly')).toBe(false);
    await editJsonActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(editor().hasAttribute('readonly')).toBe(true);
    release();
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    await settle();
    expect(editor().hasAttribute('readonly')).toBe(false);
  });

  it('keeps the same editor when the first load finishes', async () => {
    let release = () => {};
    readGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(AdminPage);
    const title = () => screen.getByLabelText('Title (required)');
    const before = title();
    expect(heading().textContent?.trim()).toBe('New Project');
    await settle();
    expect(before.matches(':disabled')).toBe(true);
    release();
    await screen.findByRole('tab', { name: 'Projects (1)' });
    await settle();
    expect(title()).toBe(before);
    expect(title().matches(':disabled')).toBe(false);
  });

  it('starts a fresh new record when Refresh discards one', async () => {
    await startNew('Projects');
    await editLabelled('Id (required)', 'typed-id');
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByText('Discard your changes to this new project?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(listReloads()).toHaveLength(2));
    await settle();
    expect((screen.getByLabelText('Id (required)') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await asJson();
    expect(editorValue()).toEqual({
      id: '',
      title: '',
      summary: '',
      status: 'planning',
      modes: [],
      related_counties: [],
      sources: [],
    });
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(heading().textContent?.trim()).toBe('Editing Project p1');
  });

  it('keeps a dirty draft when the display name is saved', async () => {
    profile = { identity: 'ed@example.test', actor: 'ed@example.test', display_name: null };
    await selectGoal('Regional goal');
    await screen.findByText(/Signed in as/);
    await editGoalActions('Mine');
    const reloadsBefore = listReloads().length;
    await fireEvent.input(screen.getByLabelText(/^Display Name/), { target: { value: 'Ed' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(status()).toContain('Display name set to "Ed".'));
    await settle();
    expect(lastWrite()).toEqual({
      method: 'PUT',
      path: '/api/me',
      body: JSON.stringify({ display_name: 'Ed' }),
    });
    expect(listReloads()).toHaveLength(reloadsBefore);
    expect(ongoingActions()).toBe('Mine');
    expect(document.querySelector('dialog')?.open).toBe(false);
  });

  it('reloads after a display-name save when the editor is clean', async () => {
    profile = { identity: 'ed@example.test', actor: 'ed@example.test', display_name: null };
    await selectGoal('Regional goal');
    await screen.findByText(/Signed in as/);
    const reloadsBefore = listReloads().length;
    await fireEvent.input(screen.getByLabelText(/^Display Name/), { target: { value: 'Ed' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(listReloads()).toHaveLength(reloadsBefore + 1));
  });

  it('moves focus to the heading after a successful save', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    const save = screen.getByRole('button', { name: 'Save Changes' });
    save.focus();
    await fireEvent.click(save);
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Editing Goal g1' })),
    );
    expect(heading().getAttribute('tabindex')).toBe('-1');
  });

  it('leaves focus on Save after a failed save', async () => {
    failWritesWith(json({ message: 'boom' }, 500));
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    const save = screen.getByRole('button', { name: 'Save Changes' });
    save.focus();
    await fireEvent.click(save);
    await waitFor(() => expect(status()).toContain('/api/goals/g1 returned 500: boom'));
    await settle();
    expect(document.activeElement).toBe(save);
    expect(document.activeElement).not.toBe(heading());
  });

  it('sends null for a link deleted from an action, with all five fields', async () => {
    stored['/api/timed-actions'] = [
      { ...action, link: { label: 'Comment', url: 'https://example.org/comment' } },
    ];
    await openActionsTabAndSelect('Existing action');
    await asJson();
    await typeIntoEditor(
      JSON.stringify({
        goal_id: 'g1',
        description: 'Existing action',
        location: null,
        expires_on: '2026-12-01',
      }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/timed-actions/ta-existing' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      goal_id: 'g1',
      description: 'Existing action',
      link: null,
      location: null,
      expires_on: '2026-12-01',
    });
  });

  it('reports a description deleted from an action and sends nothing', async () => {
    await openActionsTabAndSelect('Existing action');
    await asJson();
    await typeIntoEditor(
      JSON.stringify({ goal_id: 'g1', link: null, location: null, expires_on: '2026-12-01' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(within(screen.getByRole('alert')).getByText('Enter a description')).toBeTruthy();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(reads('/api/timed-actions/ta-existing')).toHaveLength(0);
  });
});

describe('error summary', () => {
  const summary = () => screen.getByRole('alert');
  const normalTitle = () => document.title.replace(/^Error: /, '');

  async function failNewActionSave() {
    await startNew('Actions');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
  }

  it('takes focus after a failed save, and again when the same save fails again', async () => {
    await failNewActionSave();
    await waitFor(() => expect(document.activeElement).toBe(summary()));

    const button = screen.getByRole('button', { name: 'Create Action' });
    button.focus();
    await fireEvent.click(button);
    await waitFor(() => expect(document.activeElement).toBe(summary()));
  });

  it('takes focus when the JSON does not parse', async () => {
    await selectGoal('Regional goal');
    await asJson();
    await typeIntoEditor('{"goal": ');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(document.activeElement).toBe(summary()));
    expect(within(summary()).getAllByRole('link')).toHaveLength(1);
  });

  it('takes focus when the server rejects a field', async () => {
    failWritesWith(
      json({ message: 'project validation failed - sources.0.url: Invalid URL' }, 400),
    );
    await selectProject('Proj One');
    await asJson();
    await typeIntoEditor(
      JSON.stringify({
        ...editorValue(),
        sources: [{ label: 'Plan v2', url: 'https://example.org/plan' }],
      }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(document.activeElement).toBe(summary()));
  });

  it('links every problem to the JSON text, and a click focuses it', async () => {
    await failNewActionSave();
    await asJson();
    const links = within(summary()).getAllByRole('link');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('#action-json');
    }
    expect(editor().id).toBe('action-json');
    await fireEvent.click(links[0]!);
    expect(document.activeElement).toBe(editor());
  });

  it('prefixes the page title with Error: while problems show, and restores it', async () => {
    await startNew('Actions');
    await asJson();
    const before = document.title;
    expect(before.startsWith('Error: ')).toBe(false);
    await typeIntoEditor(JSON.stringify({ ...newAction, description: '' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(document.title).toBe(`Error: ${before}`));

    await typeIntoEditor(JSON.stringify(newAction));
    await waitFor(() => expect(document.title).toBe(before));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await settle();
    expect(document.title).toBe(before);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('restores the title when the pane is closed', async () => {
    await selectGoal('Regional goal');
    await asJson();
    const before = document.title;
    await typeIntoEditor('{"goal": ');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(document.title).toBe(`Error: ${before}`));
    await fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(document.title).toBe(before));
    expect(normalTitle()).toBe(before);
  });

  it('drops a problem when its value becomes valid, and keeps an invalid one with its new message', async () => {
    await failNewActionSave();
    expect(within(summary()).getAllByRole('link')).toHaveLength(3);
    expect(within(summary()).getByText('Enter a description')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Description (required)'), {
      target: { value: 'Something' },
    });
    expect(within(summary()).queryByText('Enter a description')).toBeNull();
    expect(within(summary()).getAllByRole('link')).toHaveLength(2);
    expect(within(summary()).getByText('Choose a goal')).toBeTruthy();

    const lastDay = screen.getByLabelText('Last day (required)');
    expect(within(summary()).getByText('Choose a last day')).toBeTruthy();
    await fireEvent.input(lastDay, { target: { value: '2020-01-01' } });
    const links = within(summary()).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(within(summary()).queryByText('Choose a last day')).toBeNull();
    expect(links[1]!.textContent).toMatch(/^Last day /);
    expect(lastDay.getAttribute('aria-invalid')).toBe('true');
  });

  it('never shows a problem the last Save did not report', async () => {
    await failNewActionSave();
    await fireEvent.input(screen.getByLabelText('Link button label'), {
      target: { value: 'x'.repeat(41) },
    });
    expect(within(summary()).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByLabelText('Link button label').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.getByLabelText('Link web address').hasAttribute('aria-invalid')).toBe(false);
  });

  it('does not restore an Error: prefix it found on the title', async () => {
    await startNew('Actions');
    document.title = 'Error: Stale';
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(document.title).toBe('Error: Stale'));
    await fireEvent.change(screen.getByLabelText('Goal (required)'), { target: { value: 'g1' } });
    await fireEvent.input(screen.getByLabelText('Description (required)'), {
      target: { value: 'Filled' },
    });
    await fireEvent.input(screen.getByLabelText('Last day (required)'), {
      target: { value: '2026-12-05' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(document.title).toBe('Stale'));
  });

  it('disables Format JSON while the text is read-only', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await selectGoal('Regional goal');
    await asJson();
    const format = screen.getByRole('button', { name: 'Format JSON' });
    expect(format.hasAttribute('disabled')).toBe(false);
    await editJsonActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(format.hasAttribute('disabled')).toBe(true);
    release();
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    await settle();
    expect(screen.getByRole('button', { name: 'Format JSON' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('moves focus to the heading after Close', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(heading().textContent).toContain('New'));
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });
});

describe('goal form', () => {
  const summary = () => screen.getByRole('alert');
  const group = (name: string) => screen.getByRole('group', { name });
  const orgField = (row: number, label: string) =>
    within(group(`Organisation ${row}`)).getByLabelText(label);

  function serveGoal(overrides: Row) {
    stored['/api/goals'] = [{ ...structuredClone(goal), ...overrides }];
  }

  async function addOrganisation(url: string) {
    const name = screen.queryByRole('button', { name: 'Add an organisation' })
      ? 'Add an organisation'
      : 'Add another organisation';
    await fireEvent.click(screen.getByRole('button', { name }));
    const rows = screen.getAllByRole('group', { name: /^Organisation \d+$/ });
    await fireEvent.input(within(rows.at(-1)!).getByLabelText('Web address'), {
      target: { value: url },
    });
  }

  it('saves a county tick and a new organisation as two changed keys', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByLabelText('Fulton'));
    await fireEvent.click(screen.getByRole('button', { name: 'Add an organisation' }));
    await fireEvent.input(screen.getByLabelText('Name (required)'), {
      target: { value: 'Beltline Rail Now' },
    });
    await fireEvent.input(screen.getByLabelText('Web address'), {
      target: { value: 'https://beltlinerailnow.com/' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/goals/g1' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      related_counties: ['13121'],
      related_orgs: [{ name: 'Beltline Rail Now', url: 'https://beltlinerailnow.com/' }],
    });
  });

  it('starts an action from its goal', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    expect(screen.getByRole('heading', { name: 'New Action' })).toBeTruthy();
    expect((screen.getByLabelText('Goal (required)') as HTMLSelectElement).value).toBe('g1');
    expect(tab(/^Actions/).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Back to goal' })).toBeNull();
  });

  it('offers a way back to the goal after the action is created', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Editing Action ta-newrecord' })).toBeTruthy(),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Back to goal' }));
    expect(screen.getByRole('heading', { name: 'Editing Goal g1' })).toBeTruthy();
    expect(tab(/^Goals/).getAttribute('aria-selected')).toBe('true');
    expect(
      within(screen.getByRole('list', { name: 'Actions for this goal' })).getByText(
        'Brand new action — 2026-12-05',
      ),
    ).toBeTruthy();
  });

  it('moves focus to the heading after adding an action and after going back', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'New Action' })),
    );
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Back to goal' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Editing Goal g1' })),
    );
  });

  it('explains why an archived goal cannot take an action', async () => {
    serveGoal({ is_archived: true });
    await selectGoal('Regional goal');
    expect(screen.queryByRole('button', { name: 'Add an action for this goal' })).toBeNull();
    expect(screen.getByText('Restore this goal before adding an action.')).toBeTruthy();
  });

  it('names fields the form does not show and keeps them', async () => {
    serveGoal({ 'Extra Key': ['x'] });
    await selectGoal('Regional goal');
    expect(
      screen.getByText(
        'This goal has 1 field the form does not show: Extra Key. Use Edit as JSON to change them.',
      ),
    ).toBeTruthy();
    await editLabelled('Ongoing actions', 'New advice');
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({ actions: 'New advice' });
  });

  it('keeps a related project id that matches no project', async () => {
    serveGoal({ related_project_ids: ['gone'] });
    await selectGoal('Regional goal');
    expect((screen.getByLabelText('gone (not in the list)') as HTMLInputElement).checked).toBe(
      true,
    );
    await editLabelled('Ongoing actions', 'New advice');
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({ actions: 'New advice' });
  });

  it('creates a goal from the form with the typed id and no server-managed keys', async () => {
    await startNew('Goals');
    expect(screen.getByText('Save this goal before adding an action.')).toBeTruthy();
    await editLabelled('Id (required)', 'new-goal');
    await editLabelled('Goal (required)', 'A new goal');
    await fireEvent.click(screen.getByLabelText('DeKalb'));
    await fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/goals' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      id: 'new-goal',
      goal: 'A new goal',
      actions: '',
      related_project_ids: [],
      related_counties: ['13089'],
      related_orgs: [],
    });
    await waitFor(() => expect(heading().textContent?.trim()).toBe('Editing Goal new-goal'));
    expect(screen.getByText('Id: new-goal')).toBeTruthy();
    expect(screen.queryByLabelText('Id (required)')).toBeNull();
  });

  it('reports an id that is already used at Id (required)', async () => {
    await startNew('Goals');
    await editLabelled('Id (required)', 'g1');
    await editLabelled('Goal (required)', 'Copy');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(summaryLinks()).toEqual([
      ['A goal with this id already exists, including archived ones', '#goal-id'],
    ]);
    expect(screen.getByLabelText('Id (required)').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(summary());
  });

  it('stays clean when a county is unticked and ticked again', async () => {
    serveGoal({ related_counties: ['13121', '13089'] });
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByLabelText('Fulton'));
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Fulton'));
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(status()).toContain('No changes to save.');
    expect(writes()).toHaveLength(0);
  });

  it('sends only related_orgs, the other organisation unchanged, after one name changes', async () => {
    const first = {
      name: 'First org',
      url: 'https://first.example',
      contact_info: '',
      role: 'lead',
    };
    const second = { name: 'Second org', notes: { kept: [1, 2] }, contact_info: 'Call' };
    serveGoal({ related_orgs: [first, second] });
    await selectGoal('Regional goal');
    await fireEvent.input(orgField(2, 'Name (required)'), { target: { value: 'Renamed org' } });
    await save();
    expect(lastWrite()).toMatchObject({ method: 'PATCH', path: '/api/goals/g1' });
    expect(lastWrite().body).toBe(
      JSON.stringify({ related_orgs: [first, { ...second, name: 'Renamed org' }] }),
    );
  });

  it('sends the remaining organisations after one is removed', async () => {
    const first = { name: 'First org', url: 'https://first.example' };
    const second = { name: 'Second org', notes: 'kept', contact_info: '' };
    serveGoal({ related_orgs: [first, second] });
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove organisation 1' }));
    await save();
    expect(lastWrite().body).toBe(JSON.stringify({ related_orgs: [second] }));
  });

  it('opens a new action from its goal clean, and saves it with that goal', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(dialogOpen()).toBe(false);
    expect(heading().textContent?.trim()).toBe('Editing Project p1');

    await fireEvent.click(tab(/^Goals/));
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/timed-actions' });
    expect(JSON.parse(lastWrite().body!)).toEqual(newAction);
  });

  it('makes a preset action dirty once its goal is changed', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fireEvent.change(screen.getByLabelText('Goal (required)'), { target: { value: '' } });
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.click(screen.getByRole('button', { name: /Proj One/ }));
    expect(dialogOpen()).toBe(true);
    expect(screen.getByText('Discard your changes to this new action?')).toBeTruthy();
  });

  it('asks before leaving a dirty goal for a new action', async () => {
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    expect(dialogOpen()).toBe(true);
    expect(screen.getByText('Discard your changes to Goal g1?')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await settle();
    expect(heading().textContent?.trim()).toBe('Editing Goal g1');
    expect(ongoingActions()).toBe('Mine');

    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(heading().textContent?.trim()).toBe('New Action'));
    expect((screen.getByLabelText('Goal (required)') as HTMLSelectElement).value).toBe('g1');
    expect(writes()).toHaveLength(0);
  });

  it('offers Back to goal only for the action created from the goal', async () => {
    await openActionsTabAndSelect('Existing action');
    expect(screen.queryByRole('button', { name: 'Back to goal' })).toBeNull();

    await fireEvent.click(tab(/^Goals/));
    await fireEvent.click(screen.getByRole('button', { name: /Regional goal/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to goal' })).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: /Existing action/ }));
    expect(heading().textContent?.trim()).toBe('Editing Action ta-existing');
    expect(screen.queryByRole('button', { name: 'Back to goal' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /Brand new action/ }));
    expect(heading().textContent?.trim()).toBe('Editing Action ta-newrecord');
    expect(screen.queryByRole('button', { name: 'Back to goal' })).toBeNull();
  });

  it('goes back to the goal the action was saved under, not the one it started from', async () => {
    stored['/api/goals'] = [
      structuredClone(goal),
      { id: 'g2', goal: 'Second goal', related_project_ids: [] },
    ];
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fireEvent.change(screen.getByLabelText('Goal (required)'), { target: { value: 'g2' } });
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(lastWrite().body!)).toEqual({ ...newAction, goal_id: 'g2' });
    await fireEvent.click(await screen.findByRole('button', { name: 'Back to goal' }));
    expect(heading().textContent?.trim()).toBe('Editing Goal g2');
    expect(
      within(screen.getByRole('list', { name: 'Actions for this goal' })).getByText(
        'Brand new action — 2026-12-05',
      ),
    ).toBeTruthy();
  });

  it('keeps stored county and project ids it does not know when others are ticked', async () => {
    serveGoal({ related_counties: ['13999'], related_project_ids: ['gone'] });
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByLabelText('Fulton'));
    await fireEvent.click(screen.getByLabelText('Proj One'));
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({
      related_counties: ['13999', '13121'],
      related_project_ids: ['gone', 'p1'],
    });
  });

  it('forgets Back to goal when the editor is closed', async () => {
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByRole('button', { name: 'Add an action for this goal' }));
    await fillAction({ description: 'Brand new action', lastDay: '2026-12-05' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to goal' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await waitFor(() => expect(heading().textContent?.trim()).toBe('New Action'));
    await fireEvent.click(screen.getByRole('button', { name: /Brand new action/ }));
    expect(heading().textContent?.trim()).toBe('Editing Action ta-newrecord');
    expect(screen.queryByRole('button', { name: 'Back to goal' })).toBeNull();
  });

  it('keeps organisation errors on their rows as rows are added and removed', async () => {
    await selectGoal('Regional goal');
    await addOrganisation('https://first.example');
    await addOrganisation('https://second.example');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    const both = [
      ['Organisation 1 name: enter a value', '#goal-related_orgs-0-name'],
      ['Organisation 2 name: enter a value', '#goal-related_orgs-1-name'],
    ];
    expect(summaryLinks()).toEqual(both);
    expect(orgField(1, 'Name (required)').getAttribute('aria-invalid')).toBe('true');
    expect(orgField(2, 'Name (required)').getAttribute('aria-invalid')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Add another organisation' }));
    expect(summaryLinks()).toEqual(both);
    expect(orgField(3, 'Name (required)').hasAttribute('aria-invalid')).toBe(false);
    await fireEvent.input(orgField(3, 'Web address'), {
      target: { value: 'https://third.example' },
    });
    expect(summaryLinks()).toEqual(both);
    expect(orgField(3, 'Name (required)').hasAttribute('aria-invalid')).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove organisation 1' }));
    expect(summaryLinks()).toEqual([
      ['Organisation 1 name: enter a value', '#goal-related_orgs-0-name'],
    ]);
    expect((orgField(1, 'Web address') as HTMLInputElement).value).toBe('https://second.example');
    expect(orgField(1, 'Name (required)').getAttribute('aria-invalid')).toBe('true');
    expect(orgField(2, 'Name (required)').hasAttribute('aria-invalid')).toBe(false);

    await fireEvent.input(orgField(1, 'Name (required)'), { target: { value: 'Second org' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it('keeps row errors on their rows across a JSON edit and back', async () => {
    await selectGoal('Regional goal');
    await addOrganisation('https://first.example');
    await addOrganisation('https://second.example');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await asJson();
    await typeIntoEditor(JSON.stringify({ ...editorValue(), goal: 'Edited in JSON' }));
    expect(within(summary()).getAllByRole('link')).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(summaryLinks()).toEqual([
      ['Organisation 1 name: enter a value', '#goal-related_orgs-0-name'],
      ['Organisation 2 name: enter a value', '#goal-related_orgs-1-name'],
    ]);
    expect(orgField(2, 'Name (required)').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Goal (required)') as HTMLTextAreaElement).value).toBe(
      'Edited in JSON',
    );
  });

  it('renames a row error when a blank row before it is dropped', async () => {
    await selectGoal('Regional goal');
    await addOrganisation('https://first.example');
    await addOrganisation('https://second.example');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await fireEvent.input(orgField(1, 'Web address'), { target: { value: '' } });
    expect(summaryLinks()).toEqual([
      ['Organisation 2 name: enter a value', '#goal-related_orgs-1-name'],
    ]);
    expect(orgField(1, 'Name (required)').hasAttribute('aria-invalid')).toBe(false);
    expect(
      within(group('Organisation 2')).getByText('Error: Organisation 2 name: enter a value'),
    ).toBeTruthy();
  });

  it('shows invalid related project ids as one problem on the group', async () => {
    serveGoal({ related_project_ids: ['Bad Id', 'Also Bad'] });
    await selectGoal('Regional goal');
    await fireEvent.click(screen.getByLabelText('Proj One'));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await settle();
    expect(writes()).toHaveLength(0);
    const message = 'Related projects: use lowercase letters, numbers and hyphens only';
    expect(summaryLinks()).toEqual([[message, '#goal-related_project_ids']]);
    expect(within(group('Related projects')).getByText(`Error: ${message}`)).toBeTruthy();
    await fireEvent.click(within(summary()).getByRole('link'));
    expect(document.activeElement).toBe(screen.getByLabelText('Proj One'));
  });

  it('disables the goal form while a save is in flight', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await selectGoal('Regional goal');
    await editGoalActions('Mine');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.getByLabelText('Ongoing actions').matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Fulton').matches(':disabled')).toBe(true);
    release();
    await waitFor(() => expect(status()).toContain('Updated goal g1.'));
    await settle();
    expect(screen.getByLabelText('Ongoing actions').matches(':disabled')).toBe(false);
  });

  it('opens every live goal clean, in the form and across the views', async () => {
    stored['/api/goals'] = structuredClone(liveGoals);
    stored['/api/projects'] = structuredClone(liveProjects);
    stored['/api/timed-actions'] = structuredClone(liveActions);
    await renderLoaded();
    await fireEvent.click(tab(/^Goals/));
    for (const live of liveGoals) {
      await fireEvent.click(screen.getByTitle(live.id));
      expect(dialogOpen()).toBe(false);
      expect(heading().textContent?.trim()).toBe(`Editing Goal ${live.id}`);
      expect((screen.getByLabelText('Goal (required)') as HTMLTextAreaElement).value).toBe(
        live.goal,
      );
      for (const projectId of live.related_project_ids) {
        const related = liveProjects.find((candidate) => candidate.id === projectId)!;
        const suffix = related.is_archived ? ' (archived)' : '';
        expect(
          (screen.getByLabelText(`${related.title}${suffix}`) as HTMLInputElement).checked,
        ).toBe(true);
      }
      expect(screen.queryByText(/\(not in the list\)$/)).toBeNull();
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      await settle();
      expect(status()).toContain('No changes to save.');
      await asJson();
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
    }
    expect(writes()).toHaveLength(0);
    expect(calls.filter((call) => /^\/api\/goals\/./.test(call.path))).toHaveLength(0);
  });
});

describe('project form', () => {
  const summary = () => screen.getByRole('alert');
  const group = (name: string) => screen.getByRole('group', { name });
  const fieldIn = (name: string, label: string) =>
    within(group(name)).getByLabelText(label) as HTMLInputElement;
  const projectTitle = () => screen.getAllByLabelText('Title (required)')[0] as HTMLInputElement;
  const liveBrt = liveProjects.find(
    (candidate) => candidate.id === 'marta-bus-rapid-transit-study-2025',
  )!;
  const [p1, m1, s1] = [liveBrt.partners[0]!, liveBrt.milestones[0]!, liveBrt.sources[0]!];
  const p2 = { name: 'City of Atlanta', role: 'funder' };
  const m2 = { title: 'Board vote', date: 'Spring 2027', owner: 'MARTA' };
  const s2 = { label: 'Board memo', url: 'https://itsmarta.com/memo', archive_id: 7 };
  const brt = {
    ...structuredClone(liveBrt),
    notes: { kept: [1, 2] },
    partners: [...liveBrt.partners, p2],
    milestones: [...liveBrt.milestones, m2],
    sources: [...liveBrt.sources, s2],
  };

  function serveProject(record: Row) {
    stored['/api/projects'] = [structuredClone(record)];
  }

  async function openBrt() {
    serveProject(brt);
    await selectProject('MARTA Bus Rapid Transit Study');
  }

  it('saves a status change as one key', async () => {
    await selectProject('Proj One');
    await fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'implementation' },
    });
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({ status: 'implementation' });
  });

  it('keeps a status and a date the lists and picker do not know', async () => {
    serveProject({
      id: 'odd',
      title: 'Odd',
      status: 'on-hold',
      start_date: 'Spring 2027',
      modes: ['ferry'],
    });
    await selectProject('Odd');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('on-hold');
    expect(screen.getByRole('option', { name: 'on-hold (not in the list)' })).toBeTruthy();
    expect((screen.getByLabelText('Start date') as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText('ferry (not in the list)') as HTMLInputElement).checked).toBe(
      true,
    );
    await editLabelled('Title (required)', 'Odd, renamed');
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({ title: 'Odd, renamed' });
  });

  it('adds a source with a date and reorders sources', async () => {
    serveProject({ ...project, sources: [] });
    await selectProject('Proj One');
    await addSource({ label: 'First', url: 'https://a.example/1' });
    await addSource({ label: 'Second', url: 'https://a.example/2', lastVerified: '2026-11-14' });
    await fireEvent.click(screen.getByRole('button', { name: 'Move source 2 up' }));
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({
      sources: [
        { label: 'Second', url: 'https://a.example/2', last_verified: '2026-11-14' },
        { label: 'First', url: 'https://a.example/1' },
      ],
    });
  });

  it('will not blank a stored lead organisation', async () => {
    serveProject({ ...project, lead_org: { name: 'MARTA', url: 'https://itsmarta.com/' } });
    await selectProject('Proj One');
    expect(screen.getByText('Can be changed but not removed.')).toBeTruthy();
    await editLabelled('Lead organisation name', '');
    await attemptSave();
    expect(writes()).toHaveLength(0);
    expect(
      within(screen.getByRole('alert')).getByText(
        "Enter the lead organisation's name. It can be changed but not removed.",
      ),
    ).toBeTruthy();
  });

  it('creates a project with its id', async () => {
    await startNew('Projects');
    await editLabelled('Id (required)', 'new-line');
    await editLabelled('Title (required)', 'New line');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(lastWrite()).toMatchObject({ method: 'POST', path: '/api/projects' });
    expect(JSON.parse(lastWrite().body!)).toEqual({
      id: 'new-line',
      title: 'New line',
      summary: '',
      status: 'planning',
      modes: [],
      related_counties: [],
      sources: [],
    });
    await waitFor(() => expect(heading().textContent?.trim()).toBe('Editing Project new-line'));
    expect(screen.getByText('Id: new-line')).toBeTruthy();
    expect(screen.queryByLabelText('Id (required)')).toBeNull();
  });

  it('opens every live project clean, in the form and across the views', async () => {
    stored['/api/projects'] = structuredClone(liveProjects);
    stored['/api/goals'] = structuredClone(liveGoals);
    stored['/api/timed-actions'] = structuredClone(liveActions);
    await renderLoaded();
    expect(liveProjects).toHaveLength(20);
    for (const live of liveProjects) {
      await fireEvent.click(screen.getByTitle(live.id));
      expect(dialogOpen()).toBe(false);
      expect(heading().textContent?.trim()).toBe(`Editing Project ${live.id}`);
      expect(projectTitle().value).toBe(live.title);
      expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe(live.status);
      expect((screen.getByLabelText('Geographic scope') as HTMLSelectElement).value).toBe(
        live.geo_scope,
      );
      expect(screen.getAllByRole('group', { name: /^Source \d+$/ })).toHaveLength(
        live.sources.length,
      );
      expect(screen.queryByText(/\(not in the list\)/)).toBeNull();
      expect(screen.queryByText(/the form does not show/)).toBeNull();
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      await settle();
      expect(status()).toContain('No changes to save.');
      await asJson();
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
      expect(screen.queryByText('Unsaved changes.')).toBeNull();
    }
    expect(writes()).toHaveLength(0);
    expect(calls.filter((call) => /^\/api\/projects\/./.test(call.path))).toHaveLength(0);
  });

  it.each<[string, () => Promise<unknown>, Row]>([
    [
      'the title',
      () => fireEvent.input(projectTitle(), { target: { value: 'BRT study' } }),
      { title: 'BRT study' },
    ],
    [
      'the summary',
      () => editLabelled('Summary', 'Shorter summary'),
      { summary: 'Shorter summary' },
    ],
    [
      'the status',
      () => fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } }),
      { status: 'completed' },
    ],
    [
      'the scope',
      () =>
        fireEvent.change(screen.getByLabelText('Geographic scope'), {
          target: { value: 'regional' },
        }),
      { geo_scope: 'regional' },
    ],
    [
      'a start date set',
      () => editLabelled('Start date', '2025-01-01'),
      { start_date: '2025-01-01' },
    ],
    ['a start date cleared', () => editLabelled('Start date', ''), { start_date: null }],
    ['an end date set', () => editLabelled('End date', '2027-12-31'), { end_date: '2027-12-31' }],
    [
      'a county ticked',
      () => fireEvent.click(screen.getByLabelText('Cobb')),
      { related_counties: ['13121', '13089', '13067'] },
    ],
    [
      'a mode ticked',
      () => fireEvent.click(screen.getByLabelText('Rail')),
      { modes: ['bus', 'transit', 'rail'] },
    ],
    [
      'the lead organisation web address changed',
      () => editLabelled('Lead organisation web address', 'https://www.itsmarta.com/'),
      { lead_org: { ...liveBrt.lead_org, url: 'https://www.itsmarta.com/' } },
    ],
    [
      'the lead organisation web address cleared',
      () => editLabelled('Lead organisation web address', ''),
      { lead_org: { name: liveBrt.lead_org.name } },
    ],
    [
      'a partner added',
      async () => {
        const row = await addRow('partner');
        await editIn(row, 'Name (required)', 'Invest Atlanta');
        await editIn(row, 'Web address', 'https://investatlanta.com/');
      },
      { partners: [p1, p2, { name: 'Invest Atlanta', url: 'https://investatlanta.com/' }] },
    ],
    [
      'a partner edited',
      () => editIn(group('Partner 2'), 'Name (required)', 'City of Atlanta DOT'),
      { partners: [p1, { ...p2, name: 'City of Atlanta DOT' }] },
    ],
    [
      'a partner removed',
      () => fireEvent.click(screen.getByRole('button', { name: 'Remove partner 1' })),
      { partners: [p2] },
    ],
    [
      'a milestone added',
      async () => {
        const row = await addRow('milestone');
        await editIn(row, 'Title (required)', 'Opening');
        await editIn(row, 'Date', '2027-06-01');
      },
      { milestones: [m1, m2, { title: 'Opening', date: '2027-06-01' }] },
    ],
    [
      'a milestone edited',
      () => editIn(group('Milestone 1'), 'Date', '2024-11-01'),
      { milestones: [{ ...m1, date: '2024-11-01' }, m2] },
    ],
    [
      'a milestone removed',
      () => fireEvent.click(screen.getByRole('button', { name: 'Remove milestone 2' })),
      { milestones: [m1] },
    ],
    [
      'a source added',
      () => addSource({ label: 'Board minutes', url: 'https://itsmarta.com/minutes' }),
      { sources: [s1, s2, { label: 'Board minutes', url: 'https://itsmarta.com/minutes' }] },
    ],
    [
      'a source edited',
      () => editIn(group('Source 2'), 'Label (required)', 'Board memo, final'),
      { sources: [s1, { ...s2, label: 'Board memo, final' }] },
    ],
    [
      'a source removed',
      () => fireEvent.click(screen.getByRole('button', { name: 'Remove source 1' })),
      { sources: [s2] },
    ],
    [
      'a source moved',
      () => fireEvent.click(screen.getByRole('button', { name: 'Move source 2 up' })),
      { sources: [s2, s1] },
    ],
    [
      'a last verified date set',
      () => editIn(group('Source 2'), 'Last verified', '2026-11-14'),
      { sources: [s1, { ...s2, last_verified: '2026-11-14' }] },
    ],
    [
      'a last verified date cleared',
      () => editIn(group('Source 1'), 'Last verified', ''),
      { sources: [{ label: s1.label, url: s1.url }, s2] },
    ],
  ])('sends only the changed key for %s, other rows untouched', async (_name, edit, body) => {
    await openBrt();
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await edit();
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
    await save();
    expect(lastWrite()).toMatchObject({
      method: 'PATCH',
      path: '/api/projects/marta-bus-rapid-transit-study-2025',
    });
    expect(lastWrite().body).toBe(JSON.stringify(body));
  });

  it('shows the stored text date of a live-shaped milestone as text', async () => {
    await openBrt();
    const date = fieldIn('Milestone 2', 'Date');
    expect(date.type).toBe('text');
    expect(date.value).toBe('Spring 2027');
    expect(fieldIn('Milestone 1', 'Date').type).toBe('date');
  });

  it('reports a half-filled source at its web address and sends nothing', async () => {
    await selectProject('Proj One');
    await addSource({ label: 'Half' });
    await attemptSave();
    expect(writes()).toHaveLength(0);
    expect(reads('/api/projects/p1')).toHaveLength(0);
    expect(summaryLinks()).toEqual([
      ['Source 2 web address: enter a value', '#project-sources-1-url'],
    ]);
    expect(fieldIn('Source 2', 'Web address (required)').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(summary());
  });

  it('ignores a blank new row in each group on Save', async () => {
    await selectProject('Proj One');
    await addRow('partner');
    await addRow('milestone');
    await addRow('source');
    await attemptSave();
    expect(writes()).toHaveLength(0);
    expect(status()).toContain('No changes to save.');

    await addRow('partner');
    await addRow('milestone');
    await addRow('source');
    await fireEvent.input(projectTitle(), { target: { value: 'Proj One, renamed' } });
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({ title: 'Proj One, renamed' });
  });

  it('reports a milestone without a title and saves one without a date', async () => {
    await selectProject('Proj One');
    const first = await addRow('milestone');
    await editIn(first, 'Date', '2027-01-01');
    await attemptSave();
    expect(writes()).toHaveLength(0);
    expect(summaryLinks()).toEqual([
      ['Milestone 1 title: enter a value', '#project-milestones-0-title'],
    ]);
    expect(fieldIn('Milestone 1', 'Title (required)').getAttribute('aria-invalid')).toBe('true');

    await fireEvent.click(screen.getByRole('button', { name: 'Remove milestone 1' }));
    const second = await addRow('milestone');
    await editIn(second, 'Title (required)', 'Opening');
    await save();
    expect(lastWrite().body).toBe(JSON.stringify({ milestones: [{ title: 'Opening' }] }));
  });

  it('keeps each source problem on its row when a source moves up', async () => {
    await selectProject('Proj One');
    await addSource({ label: 'No address' });
    await addSource({ url: 'https://no-label.example' });
    await attemptSave();
    expect(writes()).toHaveLength(0);
    expect(summaryLinks()).toEqual([
      ['Source 2 web address: enter a value', '#project-sources-1-url'],
      ['Source 3 label: enter a value', '#project-sources-2-label'],
    ]);

    await fireEvent.click(screen.getByRole('button', { name: 'Move source 3 up' }));
    expect(summaryLinks()).toEqual([
      ['Source 2 label: enter a value', '#project-sources-1-label'],
      ['Source 3 web address: enter a value', '#project-sources-2-url'],
    ]);
    expect(fieldIn('Source 2', 'Label (required)').getAttribute('aria-invalid')).toBe('true');
    expect(fieldIn('Source 2', 'Web address (required)').hasAttribute('aria-invalid')).toBe(false);
    expect(fieldIn('Source 3', 'Web address (required)').getAttribute('aria-invalid')).toBe('true');
    expect(fieldIn('Source 3', 'Label (required)').hasAttribute('aria-invalid')).toBe(false);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
    await fireEvent.click(within(summary()).getAllByRole('link')[0]!);
    expect(document.activeElement).toBe(fieldIn('Source 2', 'Label (required)'));
  });

  it('keeps a still-invalid source marked when an invalid source before it is deleted in the JSON', async () => {
    serveProject({ ...project, sources: [] });
    await selectProject('Proj One');
    await addSource({ label: 'A' });
    await addSource({ label: 'B', url: 'https://b.example' });
    await addSource({ label: 'C' });
    await attemptSave();
    expect(summaryLinks()).toEqual([
      ['Source 1 web address: enter a value', '#project-sources-0-url'],
      ['Source 3 web address: enter a value', '#project-sources-2-url'],
    ]);

    await asJson();
    const { sources } = editorValue() as { sources: Row[] };
    await typeIntoEditor(JSON.stringify({ ...editorValue(), sources: sources.slice(1) }));
    expect(summaryLinks()).toEqual([['Source 2 web address: enter a value', '#project-json']]);

    await fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(summaryLinks()).toEqual([
      ['Source 2 web address: enter a value', '#project-sources-1-url'],
    ]);
    expect(fieldIn('Source 2', 'Web address (required)').getAttribute('aria-invalid')).toBe('true');
    expect(fieldIn('Source 1', 'Web address (required)').hasAttribute('aria-invalid')).toBe(false);
  });

  it('cannot blank a stored scope, and says so', async () => {
    await openBrt();
    const scope = screen.getByLabelText('Geographic scope') as HTMLSelectElement;
    expect([...scope.options].map((option) => option.value)).toEqual([
      'corridor',
      'regional',
      'county',
      'local',
    ]);
    expect(screen.queryByRole('option', { name: 'Not set' })).toBeNull();
    expect(document.getElementById(scope.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Can be changed but not removed.',
    );
  });

  it('offers Not set for the scope of a new project, with no hint', async () => {
    await startNew('Projects');
    const scope = screen.getByLabelText('Geographic scope') as HTMLSelectElement;
    expect(scope.value).toBe('');
    expect(scope.options[0]!.textContent).toBe('Not set');
    expect(scope.hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps a stored status, scope, mode and county the lists lack across other edits', async () => {
    serveProject({
      ...project,
      status: 'on-hold',
      geo_scope: 'statewide',
      modes: ['ferry', 'bus'],
      related_counties: ['13999'],
    });
    await selectProject('Proj One');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('on-hold');
    expect((screen.getByLabelText('Geographic scope') as HTMLSelectElement).value).toBe(
      'statewide',
    );
    expect(screen.queryByText('Unsaved changes.')).toBeNull();
    await editLabelled('Summary', 'New summary');
    await fireEvent.click(screen.getByLabelText('Rail'));
    await fireEvent.click(screen.getByLabelText('Fulton'));
    await save();
    expect(JSON.parse(lastWrite().body!)).toEqual({
      summary: 'New summary',
      modes: ['ferry', 'bus', 'rail'],
      related_counties: ['13999', '13121'],
    });
  });

  it('reports a duplicate id on create at Id (required)', async () => {
    await startNew('Projects');
    await editLabelled('Id (required)', 'p1');
    await editLabelled('Title (required)', 'Copy');
    await fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(summaryLinks()).toEqual([
      ['A project with this id already exists, including archived ones', '#project-id'],
    ]);
    expect(screen.getByLabelText('Id (required)').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(summary());
  });

  it('names fields the form does not show and keeps them', async () => {
    await openBrt();
    expect(
      screen.getByText(
        'This project has 1 field the form does not show: notes. Use Edit as JSON to change them.',
      ),
    ).toBeTruthy();
    await editLabelled('Summary', 'Shorter summary');
    await save();
    expect(lastWrite().body).toBe(JSON.stringify({ summary: 'Shorter summary' }));
    await waitFor(() => expect(status()).toContain('Updated project'));
    expect(stored['/api/projects']![0]!.notes).toEqual({ kept: [1, 2] });
  });

  it('disables the project form while a save is in flight', async () => {
    let release = () => {};
    writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await selectProject('Proj One');
    await editLabelled('Summary', 'Edited');
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.getByLabelText('Summary').matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Status').matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Fulton').matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Add another source' }).matches(':disabled')).toBe(
      true,
    );
    release();
    await waitFor(() => expect(status()).toContain('Updated project p1.'));
    await settle();
    expect(screen.getByLabelText('Summary').matches(':disabled')).toBe(false);
  });
});
