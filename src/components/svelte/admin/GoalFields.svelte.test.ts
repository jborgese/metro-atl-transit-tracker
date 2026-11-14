import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalDraft } from '#lib/content/formModel/types.ts';
import type { Project, TimedAction } from '#types/content.ts';
import GoalFieldsHarness from './GoalFieldsHarness.svelte';

type HarnessProps = ComponentProps<typeof GoalFieldsHarness>;

const project = (id: string, title: string, is_archived = false): Project => ({
  id,
  title,
  summary: '',
  status: 'planning',
  is_archived,
});

const projects: Project[] = [
  project('zebra', 'Zebra line'),
  project('old-plan', 'Old plan', true),
  project('airport', 'Airport loop'),
  project('bus-plan', 'Bus plan', true),
];

const action = (id: string, description: string, expires_on: string, archived = false) =>
  ({
    id,
    goal_id: 'g1',
    description,
    link: null,
    location: null,
    expires_on,
    is_archived: archived,
  }) satisfies TimedAction;

const stored = {
  id: 'g1',
  goal: 'Regional goal',
  status_related_projects: 'On track',
  actions: 'Write in',
  related_counties: ['13121'],
  related_project_ids: ['airport'],
  related_orgs: [
    { name: 'First org', url: 'https://first.example', contact_info: 'first@example.org' },
    { name: 'Second org' },
  ],
};

function renderFields(props: Partial<HarnessProps> = {}) {
  return render(GoalFieldsHarness, { props: { projects, ...props } });
}

function renderTracked(props: Partial<HarnessProps> = {}) {
  const changes: GoalDraft[] = [];
  renderFields({ ...props, onchange: (draft) => changes.push(draft) });
  return () => changes.at(-1)!;
}

const group = (name: string) => screen.getByRole('group', { name });
const row = (n: number) => group(`Organization ${n}`);
const boxLabels = (name: string) =>
  within(group(name))
    .getAllByRole('checkbox')
    .map((box) => document.querySelector(`label[for="${box.id}"]`)!.textContent);
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GoalFields labels and hints', () => {
  it.each(['Id (required)', 'Goal (required)', 'Status', 'Ongoing actions'])(
    'has one control labeled %s',
    (label) => {
      renderFields({ isNew: true });
      expect(screen.getAllByLabelText(label)).toHaveLength(1);
    },
  );

  it.each(['Name (required)', 'Web address', 'Contact info'])(
    'labels the organization field %s in each row',
    (label) => {
      renderFields({ initial: stored });
      expect(within(row(1)).getAllByLabelText(label)).toHaveLength(1);
      expect(within(row(2)).getAllByLabelText(label)).toHaveLength(1);
      expect(screen.getAllByLabelText(label)).toHaveLength(2);
    },
  );

  it.each(['Counties', 'Related projects', 'Related organizations'])(
    'has a group named %s',
    (name) => {
      renderFields();
      expect(group(name).tagName).toBe('FIELDSET');
    },
  );

  it.each([
    ['Id (required)', 'Lowercase letters, numbers and hyphens. Cannot be changed later.'],
    ['Status', 'Web addresses become links.'],
    ['Ongoing actions', 'Standing advice with no deadline.'],
  ])('describes %s by its hint', (label, hint) => {
    renderFields({ isNew: true });
    const control = screen.getByLabelText(label);
    const hintId = `${control.id}-hint`;
    expect(control.getAttribute('aria-describedby')).toBe(hintId);
    expect(document.getElementById(hintId)!.textContent).toBe(hint);
  });

  it('describes the counties by their hint', () => {
    renderFields();
    const counties = group('Counties');
    expect(document.getElementById(counties.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Leave all unchecked to list this goal under Regional.',
    );
  });

  it('uses the goal text and both progress texts as text areas', () => {
    renderFields();
    for (const label of ['Goal (required)', 'Status', 'Ongoing actions']) {
      expect(screen.getByLabelText(label).tagName).toBe('TEXTAREA');
    }
  });

  it('builds every control id from its path', () => {
    renderFields({ isNew: true, initial: stored });
    expect(screen.getByLabelText('Id (required)').id).toBe('goal-id');
    expect(screen.getByLabelText('Goal (required)').id).toBe('goal-goal');
    expect(screen.getByLabelText('Status').id).toBe('goal-status_related_projects');
    expect(screen.getByLabelText('Ongoing actions').id).toBe('goal-actions');
    expect(group('Counties').id).toBe('goal-related_counties');
    expect(group('Related projects').id).toBe('goal-related_project_ids');
    expect(group('Related organizations').id).toBe('goal-related_orgs');
    expect(within(row(2)).getByLabelText('Name (required)').id).toBe('goal-related_orgs-1-name');
    expect(within(row(2)).getByLabelText('Web address').id).toBe('goal-related_orgs-1-url');
    expect(within(row(2)).getByLabelText('Contact info').id).toBe(
      'goal-related_orgs-1-contact_info',
    );
  });

  it('says which fields are required', () => {
    renderFields();
    expect(screen.getByText('Fields marked (required) must be filled in.')).toBeTruthy();
  });

  it('never validates natively', async () => {
    renderFields({ isNew: true, initial: stored });
    const form = document.querySelector('form')!;
    expect(form.noValidate).toBe(true);
    expect(form.querySelector('[required], [maxlength], [placeholder]')).toBeNull();
    expect(form.querySelector('[aria-errormessage]')).toBeNull();
    expect(await fireEvent.submit(form)).toBe(false);
  });
});

describe('GoalFields sections', () => {
  it('heads the sections Goal, Progress and Links, in order', () => {
    renderFields();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['Goal', 'Progress', 'Links']);
  });

  it('puts each field under its section, in the brief order', () => {
    renderFields({ isNew: true, initial: stored });
    const [goalHeading, progressHeading, linksHeading] = screen.getAllByRole('heading', {
      level: 3,
    });
    const order = [
      goalHeading!,
      screen.getByLabelText('Id (required)'),
      screen.getByLabelText('Goal (required)'),
      group('Counties'),
      progressHeading!,
      screen.getByLabelText('Status'),
      screen.getByLabelText('Ongoing actions'),
      linksHeading!,
      group('Related projects'),
      group('Related organizations'),
      screen.getByText('Actions for this goal'),
    ];
    for (const [index, node] of order.slice(1).entries()) {
      const previous = order[index]!;
      expect(previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });
});

describe('GoalFields id', () => {
  it('offers the id only for a new goal', () => {
    renderFields({ isNew: true });
    expect((screen.getByLabelText('Id (required)') as HTMLInputElement).type).toBe('text');
    expect(screen.queryByText(/^Id: /)).toBeNull();
  });

  it('shows the stored id as text for an existing goal', () => {
    renderFields({ initial: stored });
    expect(screen.queryByLabelText('Id (required)')).toBeNull();
    expect(screen.getByText('Id: g1')).toBeTruthy();
    expect(document.querySelector('#goal-id')).toBeNull();
  });
});

describe('GoalFields choices', () => {
  it('lists the counties by their short names in the county order', () => {
    renderFields();
    expect(boxLabels('Counties')).toEqual([
      'Fulton',
      'DeKalb',
      'Cobb',
      'Gwinnett',
      'Clayton',
      'Henry',
    ]);
  });

  it('lists active projects by title, then archived ones', () => {
    renderFields();
    expect(boxLabels('Related projects')).toEqual([
      'Airport loop',
      'Zebra line',
      'Bus plan (archived)',
      'Old plan (archived)',
    ]);
  });

  it('keeps archived projects in a closed disclosure apart from active ones', () => {
    renderFields();
    const group = screen.getByRole('group', { name: 'Related projects' });
    const disclosure = group.querySelector('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('summary')!.textContent).toBe('Archived projects (2)');
    expect(disclosure.contains(box('Bus plan (archived)'))).toBe(true);
    expect(disclosure.contains(box('Old plan (archived)'))).toBe(true);
    expect(disclosure.contains(box('Airport loop'))).toBe(false);
    expect(disclosure.contains(box('Zebra line'))).toBe(false);
  });

  it('checks the stored county and project', () => {
    renderFields({ initial: stored });
    expect(box('Fulton').checked).toBe(true);
    expect(box('DeKalb').checked).toBe(false);
    expect(box('Airport loop').checked).toBe(true);
    expect(box('Zebra line').checked).toBe(false);
  });

  it('keeps an unknown county and an unknown project checked and labeled', () => {
    renderFields({
      initial: { ...stored, related_counties: ['13999'], related_project_ids: ['gone'] },
    });
    expect(box('13999 (not in the list)').checked).toBe(true);
    expect(group('Counties').contains(box('13999 (not in the list)'))).toBe(true);
    expect(box('gone (not in the list)').checked).toBe(true);
    expect(group('Related projects').contains(box('gone (not in the list)'))).toBe(true);
  });
});

describe('GoalFields editing', () => {
  it('writes the text fields into the draft', async () => {
    const latest = renderTracked({ isNew: true });
    await fireEvent.input(screen.getByLabelText('Id (required)'), {
      target: { value: 'new-goal' },
    });
    await fireEvent.input(screen.getByLabelText('Goal (required)'), { target: { value: 'G' } });
    await fireEvent.input(screen.getByLabelText('Status'), { target: { value: 'S' } });
    await fireEvent.input(screen.getByLabelText('Ongoing actions'), { target: { value: 'A' } });
    expect(latest()).toMatchObject({
      id: 'new-goal',
      goal: 'G',
      status_related_projects: 'S',
      actions: 'A',
    });
  });

  it('writes checks into the draft lists', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(box('Cobb'));
    await fireEvent.click(box('Fulton'));
    await fireEvent.click(box('Bus plan (archived)'));
    expect(latest().related_counties).toEqual(['13067']);
    expect(latest().related_project_ids).toEqual(['airport', 'bus-plan']);
  });

  it('adds, edits and removes organizations in the draft', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(screen.getByRole('button', { name: 'Add another organization' }));
    const third = row(3);
    expect(document.activeElement).toBe(within(third).getByLabelText('Name (required)'));
    await fireEvent.input(within(third).getByLabelText('Name (required)'), {
      target: { value: 'Third org' },
    });
    await fireEvent.input(within(third).getByLabelText('Web address'), {
      target: { value: 'https://third.example' },
    });
    await fireEvent.input(within(third).getByLabelText('Contact info'), {
      target: { value: 'Call us' },
    });
    expect(
      latest().related_orgs.map(({ name, url, contact_info }) => [name, url, contact_info]),
    ).toEqual([
      ['First org', 'https://first.example', 'first@example.org'],
      ['Second org', '', ''],
      ['Third org', 'https://third.example', 'Call us'],
    ]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove organization 1' }));
    expect(latest().related_orgs.map((org) => org.name)).toEqual(['Second org', 'Third org']);
  });

  it('starts with no organizations and offers to add one', () => {
    renderFields();
    expect(screen.getByText('No organizations yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add an organization' })).toBeTruthy();
  });
});

describe('GoalFields errors', () => {
  it.each([
    ['id', () => screen.getByLabelText('Id (required)')],
    ['goal', () => screen.getByLabelText('Goal (required)')],
    ['status_related_projects', () => screen.getByLabelText('Status')],
    ['actions', () => screen.getByLabelText('Ongoing actions')],
    ['related_orgs.0.name', () => within(row(1)).getByLabelText('Name (required)')],
    ['related_orgs.0.url', () => within(row(1)).getByLabelText('Web address')],
    ['related_orgs.0.contact_info', () => within(row(1)).getByLabelText('Contact info')],
  ])('shows the issue at %s on its control only', (path, control) => {
    renderFields({
      isNew: true,
      initial: stored,
      issues: [
        { path, message: `Problem at ${path}` },
        { path: 'other', message: 'Elsewhere' },
      ],
    });
    const target = control();
    expect(target.getAttribute('aria-invalid')).toBe('true');
    const errorId = `${target.id}-error`;
    expect(target.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(document.getElementById(errorId)!.textContent).toBe(`Error: Problem at ${path}`);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
    expect(screen.queryByText(/Elsewhere/)).toBeNull();
  });

  it.each([
    ['related_counties', 'Counties'],
    ['related_project_ids', 'Related projects'],
  ])('shows the issue at %s on the %s group', (path, name) => {
    renderFields({ initial: stored, issues: [{ path, message: `Problem at ${path}` }] });
    const fieldset = group(name);
    const errorId = `${fieldset.id}-error`;
    expect(fieldset.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(document.getElementById(errorId)!.textContent).toBe(`Error: Problem at ${path}`);
    expect(fieldset.contains(document.getElementById(errorId))).toBe(true);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it('does not show a row problem on the other row', () => {
    renderFields({
      initial: stored,
      issues: [{ path: 'related_orgs.1.name', message: 'Second row problem' }],
    });
    expect(within(row(1)).queryByText(/Second row problem/)).toBeNull();
    expect(within(row(2)).getByText('Error: Second row problem')).toBeTruthy();
  });

  it('has no invalid control without issues', () => {
    renderFields({ isNew: true, initial: stored });
    expect(document.querySelector('[aria-invalid]')).toBeNull();
    expect(document.querySelector('.error')).toBeNull();
  });
});

describe('GoalFields actions for this goal', () => {
  it('lists active actions and keeps archived ones in a closed disclosure', () => {
    renderFields({
      initial: stored,
      actions: [
        action('ta-1', 'Ask the mayor', '2026-12-01'),
        action('ta-2', 'Old ask', '2026-10-01', true),
        action('ta-3', 'Older ask', '2026-09-01', true),
      ],
    });
    const list = screen.getByRole('list', { name: 'Actions for this goal' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Ask the mayor — 2026-12-01']);
    const disclosure = screen.getByText('Archived actions (2)').closest('details')!;
    expect(disclosure.open).toBe(false);
    expect([...disclosure.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'Old ask — 2026-10-01',
      'Older ask — 2026-09-01',
    ]);
    expect(screen.queryByText('No actions yet.')).toBeNull();
    expect(screen.queryByText('No active actions.')).toBeNull();
  });

  it('says when every action is archived and still lists them in the disclosure', () => {
    renderFields({
      initial: stored,
      actions: [action('ta-2', 'Old ask', '2026-10-01', true)],
    });
    expect(screen.getByText('No active actions.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Actions for this goal' })).toBeNull();
    expect(screen.getByText('Archived actions (1)').closest('details')!.open).toBe(false);
    expect(screen.getByText('Old ask — 2026-10-01')).toBeTruthy();
  });

  it('shows no archived disclosure when no action is archived', () => {
    renderFields({ initial: stored, actions: [action('ta-1', 'Ask the mayor', '2026-12-01')] });
    expect(screen.queryByText(/^Archived actions/)).toBeNull();
  });

  it('says when the goal has no actions', () => {
    renderFields({ initial: stored });
    expect(screen.getByText('No actions yet.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Actions for this goal' })).toBeNull();
  });

  it('offers to add an action for a saved, active goal', async () => {
    const onaddaction = vi.fn();
    renderFields({ initial: stored, onaddaction });
    const button = screen.getByRole('button', { name: 'Add an action for this goal' });
    expect(button.getAttribute('type')).toBe('button');
    await fireEvent.click(button);
    expect(onaddaction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/before adding an action/)).toBeNull();
  });

  it('asks for a new goal to be saved first', () => {
    renderFields({ isNew: true });
    expect(screen.queryByRole('button', { name: 'Add an action for this goal' })).toBeNull();
    expect(screen.getByText('Save this goal before adding an action.')).toBeTruthy();
    expect(screen.getByText('No actions yet.')).toBeTruthy();
  });

  it('asks for an archived goal to be restored first', () => {
    renderFields({ initial: stored, archived: true });
    expect(screen.queryByRole('button', { name: 'Add an action for this goal' })).toBeNull();
    expect(screen.getByText('Restore this goal before adding an action.')).toBeTruthy();
  });
});

describe('GoalFields fields the form does not show', () => {
  it('names one unknown field', () => {
    renderFields({ initial: { ...stored, 'Extra Key': ['x'] } });
    expect(
      screen.getByText(
        'This goal has 1 field the form does not show: Extra Key. Use Edit as JSON to change them.',
      ),
    ).toBeTruthy();
  });

  it('names several unknown fields in stored order', () => {
    renderFields({ initial: { notes: 'n', ...stored, extra: 1 } });
    expect(
      screen.getByText(
        'This goal has 2 fields the form does not show: notes, extra. Use Edit as JSON to change them.',
      ),
    ).toBeTruthy();
  });

  it('does not count the id, the known fields or the server-managed fields', () => {
    renderFields({
      initial: {
        ...stored,
        provenance: { updated_by: 'AB' },
        is_archived: false,
        archived_at: null,
        archived_by: null,
      },
    });
    expect(screen.queryByText(/the form does not show/)).toBeNull();
  });

  it('puts the notice above the fields', () => {
    renderFields({ initial: { ...stored, extra: 1 } });
    const notice = screen.getByText(/the form does not show/);
    const [first] = screen.getAllByRole('heading', { level: 3 });
    expect(notice.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe('GoalFields readonly', () => {
  it('disables every control while read-only', async () => {
    renderFields({ initial: stored, readonly: true });
    await tick();
    const controls = document.querySelectorAll<HTMLInputElement>(
      'form input, form textarea, form select, form button',
    );
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      expect(control.matches(':disabled')).toBe(true);
    }
  });

  it('leaves the controls enabled otherwise', () => {
    renderFields({ initial: stored });
    expect(screen.getByLabelText('Goal (required)').matches(':disabled')).toBe(false);
    expect(box('Fulton').matches(':disabled')).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Add an action for this goal' }).matches(':disabled'),
    ).toBe(false);
  });
});
