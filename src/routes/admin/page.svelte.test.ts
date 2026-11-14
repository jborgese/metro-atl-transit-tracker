import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './+page.svelte';

interface Call {
  method: string;
  path: string;
  body: string | undefined;
}

const project = { id: 'p1', title: 'Proj One', summary: 's', status: 'planning' };
const goal = { id: 'g1', goal: 'Regional goal', related_project_ids: [] };
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

const calls: Call[] = [];
let failActionsReload = false;
let actionsGetCount = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch() {
  calls.length = 0;
  actionsGetCount = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ method, path: input, body });
      if (method === 'GET') {
        if (input.startsWith('/api/projects')) return json({ data: [project] });
        if (input.startsWith('/api/goals')) return json({ data: [goal] });
        if (input.startsWith('/api/timed-actions')) {
          actionsGetCount += 1;
          return failActionsReload && actionsGetCount > 1
            ? json({ message: 'boom' }, 500)
            : json({ data: [action] });
        }
        if (input.startsWith('/api/history')) return json({ data: [] });
        return json({}, 401);
      }
      if (input === '/api/timed-actions' && method === 'POST') {
        return json({ data: { id: 'ta-newrecord', ...newAction } }, 201);
      }
      return json({ data: JSON.parse(body ?? '{}') });
    }),
  );
}

const writes = () => calls.filter((call) => call.method !== 'GET');
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const heading = () => screen.getByRole('heading', { level: 2, name: /^(New|Editing) / });

async function renderLoaded() {
  render(AdminPage);
  await screen.findByRole('tab', { name: 'Projects (1)' });
  await screen.findByRole('tab', { name: 'Actions (1)' });
}

describe('admin page editor target', () => {
  beforeEach(() => {
    failActionsReload = false;
    stubFetch();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates an action through /api/timed-actions even after visiting another tab', async () => {
    await renderLoaded();
    await fireEvent.click(tab(/^Actions/));
    await fireEvent.click(screen.getByRole('button', { name: '+ New Action' }));
    await fireEvent.click(tab(/^Goals/));

    expect(heading().textContent?.trim()).toBe('New Action');
    expect(screen.getByRole('button', { name: 'Create Action' })).toBeTruthy();

    const editor = document.querySelector('textarea')!;
    await fireEvent.input(editor, { target: { value: JSON.stringify(newAction) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', path: '/api/timed-actions' });
  });

  it('saves a selected goal to /api/goals even when the Actions tab is showing', async () => {
    await renderLoaded();
    await fireEvent.click(tab(/^Goals/));
    await fireEvent.click(screen.getByText('Regional goal'));
    await fireEvent.click(tab(/^Actions/));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'PATCH', path: '/api/goals/g1' });
  });

  it('saves a selected project to /api/projects', async () => {
    await renderLoaded();
    await fireEvent.click(screen.getByText('Proj One'));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'PATCH', path: '/api/projects/p1' });
  });

  it('selects the saved record when the actions reload fails, and says so', async () => {
    failActionsReload = true;
    await renderLoaded();
    await fireEvent.click(tab(/^Actions/));
    await fireEvent.click(screen.getByRole('button', { name: '+ New Action' }));
    const editor = document.querySelector('textarea')!;
    await fireEvent.input(editor, { target: { value: JSON.stringify(newAction) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create Action' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('reloaded'));
    expect(screen.getByRole('status').textContent).toContain('could not be reloaded');
    expect(heading().textContent).toContain('ta-newrecord');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create Action' })).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it('shows the new-record template of the tab clicked when the editor is clean and empty', async () => {
    await renderLoaded();
    expect(heading().textContent?.trim()).toBe('New Project');
    await fireEvent.click(tab(/^Actions/));
    expect(heading().textContent?.trim()).toBe('New Action');
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain(
      'expires_on',
    );
  });

  it('only changes the list when a record is selected or the editor is dirty', async () => {
    await renderLoaded();
    await fireEvent.click(screen.getByText('Proj One'));
    await fireEvent.click(tab(/^Actions/));
    expect(heading().textContent).toContain('Editing Project p1');

    await fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    await fireEvent.click(tab(/^Projects/));
    await fireEvent.input(document.querySelector('textarea')!, { target: { value: '{}' } });
    await fireEvent.click(tab(/^Goals/));
    expect(heading().textContent?.trim()).toBe('New Project');
  });
});
