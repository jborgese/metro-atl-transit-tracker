import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDraft } from '#lib/content/formModel/types.ts';
import ProjectFieldsHarness from './ProjectFieldsHarness.svelte';

type HarnessProps = ComponentProps<typeof ProjectFieldsHarness>;

const stored = {
  id: 'p1',
  title: 'Proj One',
  summary: 'What it is',
  status: 'implementation',
  geo_scope: 'corridor',
  start_date: '2026-01-15',
  end_date: null,
  modes: ['bus'],
  related_counties: ['13121'],
  lead_org: { name: 'MARTA', url: 'https://itsmarta.com/' },
  partners: [{ name: 'ARC', url: 'https://atlantaregional.org/' }, { name: 'GDOT' }],
  milestones: [{ title: 'Kickoff', date: '2026-02-01' }, { title: 'Opening' }],
  sources: [
    { label: 'Plan', url: 'https://example.org/plan', last_verified: '2026-11-13' },
    { label: 'News', url: 'https://example.org/news' },
  ],
};

const TEXT_DATE_HINT = 'Stored as text; replace it with a date to use the picker.';
const KEEP_HINT = 'Can be changed but not removed.';

function renderFields(props: Partial<HarnessProps> = {}) {
  return render(ProjectFieldsHarness, { props });
}

function renderTracked(props: Partial<HarnessProps> = {}) {
  const changes: ProjectDraft[] = [];
  renderFields({ ...props, onchange: (draft) => changes.push(draft) });
  return () => changes.at(-1)!;
}

const group = (name: string) => screen.getByRole('group', { name });
const control = <T extends HTMLElement = HTMLInputElement>(label: string, scope?: HTMLElement) =>
  (scope ? within(scope).getByLabelText(label) : screen.getByLabelText(label)) as T;
const projectTitle = () => screen.getAllByLabelText('Title (required)')[0] as HTMLInputElement;
const select = (label: string) => control<HTMLSelectElement>(label);
const optionTexts = (label: string) =>
  [...select(label).options].map((option) => [option.value, option.textContent]);
const boxLabels = (name: string) =>
  within(group(name))
    .getAllByRole('checkbox')
    .map((box) => document.querySelector(`label[for="${box.id}"]`)!.textContent);
const box = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const hintOf = (element: HTMLElement) => {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids
    .filter((id) => id.endsWith('-hint'))
    .map((id) => document.getElementById(id)!.textContent);
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ProjectFields labels and hints', () => {
  it.each([
    'Id (required)',
    'Title (required)',
    'Status',
    'Summary',
    'Start date',
    'End date',
    'Geographic scope',
    'Lead organization name',
    'Lead organization web address',
  ])('has one control labeled %s', (label) => {
    renderFields({ isNew: true });
    expect(screen.getAllByLabelText(label)).toHaveLength(1);
  });

  it.each([
    ['Partner', ['Name (required)', 'Web address']],
    ['Milestone', ['Title (required)', 'Date']],
    ['Source', ['Label (required)', 'Web address (required)', 'Last verified']],
  ])('labels each %s row field once per row', (noun, labels) => {
    renderFields({ initial: stored });
    for (const label of labels) {
      expect(within(group(`${noun} 1`)).getAllByLabelText(label)).toHaveLength(1);
      expect(within(group(`${noun} 2`)).getAllByLabelText(label)).toHaveLength(1);
    }
  });

  it('gives every control exactly one label', () => {
    renderFields({ isNew: true, initial: stored });
    const controls = document.querySelectorAll<HTMLElement>(
      'form input, form select, form textarea',
    );
    expect(controls.length).toBeGreaterThan(20);
    for (const element of controls) {
      expect(document.querySelectorAll(`label[for="${element.id}"]`)).toHaveLength(1);
    }
    expect(new Set([...controls].map((element) => element.id)).size).toBe(controls.length);
  });

  it.each(['Counties', 'Modes', 'Lead organization', 'Partners', 'Milestones', 'Sources'])(
    'has a group named %s',
    (name) => {
      renderFields();
      expect(group(name).tagName).toBe('FIELDSET');
    },
  );

  it('builds every control and group id from its path', () => {
    renderFields({ isNew: true, initial: stored });
    const ids: Array<[HTMLElement, string]> = [
      [control('Id (required)'), 'project-id'],
      [projectTitle(), 'project-title'],
      [control('Status'), 'project-status'],
      [control('Summary'), 'project-summary'],
      [control('Start date'), 'project-start_date'],
      [control('End date'), 'project-end_date'],
      [control('Geographic scope'), 'project-geo_scope'],
      [control('Lead organization name'), 'project-lead_org-name'],
      [control('Lead organization web address'), 'project-lead_org-url'],
      [group('Counties'), 'project-related_counties'],
      [group('Modes'), 'project-modes'],
      [group('Lead organization'), 'project-lead_org'],
      [group('Partners'), 'project-partners'],
      [group('Milestones'), 'project-milestones'],
      [group('Sources'), 'project-sources'],
      [control('Name (required)', group('Partner 2')), 'project-partners-1-name'],
      [control('Web address', group('Partner 2')), 'project-partners-1-url'],
      [control('Title (required)', group('Milestone 2')), 'project-milestones-1-title'],
      [control('Date', group('Milestone 2')), 'project-milestones-1-date'],
      [control('Label (required)', group('Source 2')), 'project-sources-1-label'],
      [control('Web address (required)', group('Source 2')), 'project-sources-1-url'],
      [control('Last verified', group('Source 2')), 'project-sources-1-last_verified'],
    ];
    for (const [element, id] of ids) {
      expect(element.id).toBe(id);
    }
  });

  it('describes the id by its hint', () => {
    renderFields({ isNew: true });
    expect(hintOf(control('Id (required)'))).toEqual([
      'Lowercase letters, numbers and hyphens. Cannot be changed later.',
    ]);
  });

  it('describes the sources by their hint', () => {
    renderFields({ initial: stored });
    expect(hintOf(group('Sources'))).toEqual([
      'The first source is the one linked from the project card.',
    ]);
  });

  it('uses a text area for the summary and text boxes for the title and web addresses', () => {
    renderFields({ initial: stored });
    expect(control('Summary').tagName).toBe('TEXTAREA');
    expect(projectTitle().type).toBe('text');
    expect(control('Lead organization web address').type).toBe('text');
    expect(control('Lead organization web address').inputMode).toBe('url');
    expect(control('Web address', group('Partner 1')).inputMode).toBe('url');
    expect(control('Web address (required)', group('Source 1')).inputMode).toBe('url');
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

describe('ProjectFields sections', () => {
  it('heads the sections in the brief order', () => {
    renderFields();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['Basics', 'Dates and milestones', 'Where and how', 'Organizations', 'Sources']);
  });

  it('puts each field under its section, in the brief order', () => {
    renderFields({ isNew: true, initial: stored });
    const [basics, dates, where, organizations, sources] = screen.getAllByRole('heading', {
      level: 3,
    });
    const order = [
      basics!,
      control('Id (required)'),
      projectTitle(),
      control('Status'),
      control('Summary'),
      dates!,
      control('Start date'),
      control('End date'),
      group('Milestones'),
      where!,
      control('Geographic scope'),
      group('Counties'),
      group('Modes'),
      organizations!,
      group('Lead organization'),
      group('Partners'),
      sources!,
      group('Sources'),
    ];
    for (const [index, node] of order.slice(1).entries()) {
      const previous = order[index]!;
      expect(previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });
});

describe('ProjectFields id', () => {
  it('offers the id only for a new project', () => {
    renderFields({ isNew: true });
    expect(control('Id (required)').type).toBe('text');
    expect(screen.queryByText(/^Id: /)).toBeNull();
  });

  it('shows the stored id as text for an existing project', () => {
    renderFields({ initial: stored });
    expect(screen.queryByLabelText('Id (required)')).toBeNull();
    expect(screen.getByText('Id: p1')).toBeTruthy();
    expect(document.querySelector('#project-id')).toBeNull();
  });
});

describe('ProjectFields status', () => {
  it('lists the statuses by their labels and selects the stored one', () => {
    renderFields({ initial: stored });
    expect(optionTexts('Status')).toEqual([
      ['planning', 'Planning'],
      ['public-outreach', 'Public Outreach'],
      ['funding-application', 'Funding Application'],
      ['implementation', 'Implementation'],
      ['completed', 'Completed'],
      ['ongoing', 'Ongoing'],
    ]);
    expect(select('Status').value).toBe('implementation');
  });

  it('keeps a stored status that is not in the list', () => {
    renderFields({ initial: { ...stored, status: 'on-hold' } });
    expect(optionTexts('Status').at(-1)).toEqual(['on-hold', 'on-hold (not in the list)']);
    expect(optionTexts('Status')).toHaveLength(7);
    expect(select('Status').value).toBe('on-hold');
    expect(select('Status').selectedOptions[0]!.textContent).toBe('on-hold (not in the list)');
  });

  it('offers Not set first when no status is stored', () => {
    renderFields({ initial: { id: 'p1', title: 'T' } });
    expect(optionTexts('Status')[0]).toEqual(['', 'Not set']);
    expect(optionTexts('Status')).toHaveLength(7);
    expect(select('Status').value).toBe('');
    expect(select('Status').selectedIndex).toBe(0);
  });

  it('offers no Not set once a status is stored', () => {
    renderFields({ initial: stored });
    expect(screen.queryByRole('option', { name: 'Not set' })).toBeNull();
  });
});

describe('ProjectFields geographic scope', () => {
  it('lists the scopes by their labels and selects the stored one', () => {
    renderFields({ initial: stored, hasStoredScope: true });
    expect(optionTexts('Geographic scope')).toEqual([
      ['corridor', 'Corridor'],
      ['regional', 'Regional'],
      ['county', 'County'],
      ['local', 'Local'],
    ]);
    expect(select('Geographic scope').value).toBe('corridor');
  });

  it('offers Not set first only when no scope is stored', () => {
    renderFields({ initial: { id: 'p1', title: 'T' } });
    expect(optionTexts('Geographic scope')[0]).toEqual(['', 'Not set']);
    expect(optionTexts('Geographic scope')).toHaveLength(5);
    expect(select('Geographic scope').value).toBe('');
  });

  it('keeps a stored scope that is not in the list', () => {
    renderFields({ initial: { ...stored, geo_scope: 'statewide' }, hasStoredScope: true });
    expect(optionTexts('Geographic scope')).toEqual([
      ['corridor', 'Corridor'],
      ['regional', 'Regional'],
      ['county', 'County'],
      ['local', 'Local'],
      ['statewide', 'statewide (not in the list)'],
    ]);
    expect(select('Geographic scope').value).toBe('statewide');
  });

  it('says a stored scope can be changed but not removed', () => {
    renderFields({ initial: stored, hasStoredScope: true });
    expect(hintOf(select('Geographic scope'))).toEqual([KEEP_HINT]);
  });

  it('has no hint when no scope is stored', () => {
    renderFields({ initial: { id: 'p1', title: 'T' } });
    expect(hintOf(select('Geographic scope'))).toEqual([]);
    expect(select('Geographic scope').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ProjectFields dates', () => {
  const dateControls = () => [
    control('Start date'),
    control('End date'),
    control('Date', group('Milestone 1')),
    control('Last verified', group('Source 1')),
  ];
  const withDates = (value: string | null) => ({
    ...stored,
    start_date: value,
    end_date: value,
    milestones: [{ title: 'M', date: value }],
    sources: [{ label: 'S', url: 'https://s.example', last_verified: value }],
  });

  it.each(['Spring 2027', '2026-02-30', 'TBD'])(
    'shows the stored value %s as text with a hint',
    (value) => {
      renderFields({ initial: withDates(value) });
      for (const element of dateControls()) {
        expect(element.type).toBe('text');
        expect(element.value).toBe(value);
        expect(hintOf(element)).toEqual([TEXT_DATE_HINT]);
      }
    },
  );

  it.each([['2026-11-14'], ['2024-02-29'], [''], [null]])(
    'uses the date picker for the stored value %j',
    (value) => {
      renderFields({ initial: withDates(value) });
      for (const element of dateControls()) {
        expect(element.type).toBe('date');
        expect(element.value).toBe(value ?? '');
        expect(hintOf(element)).toEqual([]);
      }
    },
  );

  it('uses the date picker when no date is stored at all', () => {
    renderFields({ initial: { id: 'p1', title: 'T' } });
    expect(control('Start date').type).toBe('date');
    expect(control('End date').type).toBe('date');
  });

  it('keeps the text box while a stored text date is replaced by a real date', async () => {
    renderFields({ initial: withDates('Spring 2027') });
    const start = control('Start date');
    await fireEvent.input(start, { target: { value: '2027-04-01' } });
    expect(control('Start date')).toBe(start);
    expect(start.type).toBe('text');
    expect(start.value).toBe('2027-04-01');
  });

  it('keeps the date picker while a stored date is cleared', async () => {
    renderFields({ initial: withDates('2026-11-14') });
    const start = control('Start date');
    await fireEvent.input(start, { target: { value: '' } });
    expect(start.type).toBe('date');
  });

  it('gives a new row the date picker', async () => {
    renderFields({ initial: withDates('Spring 2027') });
    await fireEvent.click(screen.getByRole('button', { name: 'Add another milestone' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add another source' }));
    expect(control('Date', group('Milestone 2')).type).toBe('date');
    expect(control('Last verified', group('Source 2')).type).toBe('date');
  });
});

describe('ProjectFields choices', () => {
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

  it('lists the modes by their labels', () => {
    renderFields();
    expect(boxLabels('Modes')).toEqual([
      'Transit',
      'Bus',
      'Rail',
      'Road',
      'Bike',
      'Walk',
      'Multi-modal',
    ]);
  });

  it('checks the stored county and mode', () => {
    renderFields({ initial: stored });
    expect(box('Fulton').checked).toBe(true);
    expect(box('DeKalb').checked).toBe(false);
    expect(box('Bus').checked).toBe(true);
    expect(box('Rail').checked).toBe(false);
  });

  it('keeps an unknown county and an unknown mode checked and labeled', () => {
    renderFields({ initial: { ...stored, related_counties: ['13999'], modes: ['ferry'] } });
    expect(box('13999 (not in the list)').checked).toBe(true);
    expect(group('Counties').contains(box('13999 (not in the list)'))).toBe(true);
    expect(box('ferry (not in the list)').checked).toBe(true);
    expect(group('Modes').contains(box('ferry (not in the list)'))).toBe(true);
  });

  it('gives the counties no hint', () => {
    renderFields();
    expect(group('Counties').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('ProjectFields lead organization', () => {
  it('shows the stored lead organization', () => {
    renderFields({ initial: stored, hasStoredLeadOrg: true });
    expect(control('Lead organization name').value).toBe('MARTA');
    expect(control('Lead organization web address').value).toBe('https://itsmarta.com/');
  });

  it('says a stored lead organization can be changed but not removed', () => {
    renderFields({ initial: stored, hasStoredLeadOrg: true });
    expect(hintOf(group('Lead organization'))).toEqual([KEEP_HINT]);
    expect(group('Lead organization').contains(screen.getByText(KEEP_HINT))).toBe(true);
  });

  it('has no hint without a stored lead organization', () => {
    renderFields({ initial: { id: 'p1', title: 'T' } });
    expect(group('Lead organization').hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(KEEP_HINT)).toBeNull();
  });
});

describe('ProjectFields editing', () => {
  it('writes the text fields, the selects and the dates into the draft', async () => {
    const latest = renderTracked({ isNew: true, initial: { status: 'planning' } });
    await fireEvent.input(control('Id (required)'), { target: { value: 'new-line' } });
    await fireEvent.input(control('Title (required)'), { target: { value: 'New line' } });
    await fireEvent.input(control('Summary'), { target: { value: 'About it' } });
    await fireEvent.change(select('Status'), { target: { value: 'completed' } });
    await fireEvent.change(select('Geographic scope'), { target: { value: 'local' } });
    await fireEvent.input(control('Start date'), { target: { value: '2026-12-01' } });
    await fireEvent.input(control('End date'), { target: { value: '2027-06-30' } });
    await fireEvent.input(control('Lead organization name'), { target: { value: 'MARTA' } });
    await fireEvent.input(control('Lead organization web address'), {
      target: { value: 'https://itsmarta.com/' },
    });
    expect(latest()).toMatchObject({
      id: 'new-line',
      title: 'New line',
      summary: 'About it',
      status: 'completed',
      geo_scope: 'local',
      start_date: '2026-12-01',
      end_date: '2027-06-30',
      lead_org: { name: 'MARTA', url: 'https://itsmarta.com/' },
    });
  });

  it('writes checks into the draft lists', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(box('Cobb'));
    await fireEvent.click(box('Fulton'));
    await fireEvent.click(box('Rail'));
    expect(latest().related_counties).toEqual(['13067']);
    expect(latest().modes).toEqual(['bus', 'rail']);
  });

  it('adds, edits and removes partners in the draft', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(screen.getByRole('button', { name: 'Add another partner' }));
    const third = group('Partner 3');
    expect(document.activeElement).toBe(control('Name (required)', third));
    await fireEvent.input(control('Name (required)', third), { target: { value: 'City' } });
    await fireEvent.input(control('Web address', third), {
      target: { value: 'https://city.example' },
    });
    expect(latest().partners.map(({ name, url }) => [name, url])).toEqual([
      ['ARC', 'https://atlantaregional.org/'],
      ['GDOT', ''],
      ['City', 'https://city.example'],
    ]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove partner 1' }));
    expect(latest().partners.map((row) => row.name)).toEqual(['GDOT', 'City']);
  });

  it('adds, edits and removes milestones in the draft', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(screen.getByRole('button', { name: 'Add another milestone' }));
    const third = group('Milestone 3');
    expect(document.activeElement).toBe(control('Title (required)', third));
    await fireEvent.input(control('Title (required)', third), { target: { value: 'Open' } });
    await fireEvent.input(control('Date', third), { target: { value: '2027-01-01' } });
    await fireEvent.input(control('Date', group('Milestone 2')), {
      target: { value: '2026-06-01' },
    });
    expect(latest().milestones.map(({ title, date }) => [title, date])).toEqual([
      ['Kickoff', '2026-02-01'],
      ['Opening', '2026-06-01'],
      ['Open', '2027-01-01'],
    ]);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove milestone 2' }));
    expect(latest().milestones.map((row) => row.title)).toEqual(['Kickoff', 'Open']);
  });

  it('adds, edits, moves and removes sources in the draft', async () => {
    const latest = renderTracked({ initial: stored });
    await fireEvent.click(screen.getByRole('button', { name: 'Add another source' }));
    const third = group('Source 3');
    expect(document.activeElement).toBe(control('Label (required)', third));
    await fireEvent.input(control('Label (required)', third), { target: { value: 'Report' } });
    await fireEvent.input(control('Web address (required)', third), {
      target: { value: 'https://report.example' },
    });
    await fireEvent.input(control('Last verified', third), { target: { value: '2026-11-14' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Move source 3 up' }));
    expect(latest().sources.map(({ label, last_verified }) => [label, last_verified])).toEqual([
      ['Plan', '2026-11-13'],
      ['Report', '2026-11-14'],
      ['News', ''],
    ]);
    await fireEvent.click(screen.getByRole('button', { name: 'Move source 1 down' }));
    expect(latest().sources.map((row) => row.label)).toEqual(['Report', 'Plan', 'News']);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove source 3' }));
    expect(latest().sources.map((row) => row.label)).toEqual(['Report', 'Plan']);
  });

  it('offers to move sources but not partners or milestones', () => {
    renderFields({ initial: stored });
    expect(screen.getByRole('button', { name: 'Move source 1 down' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move source 2 up' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Move (partner|milestone)/ })).toBeNull();
  });

  it('starts with no rows and offers to add one of each', () => {
    renderFields();
    expect(screen.getByText('No partners yet.')).toBeTruthy();
    expect(screen.getByText('No milestones yet.')).toBeTruthy();
    expect(screen.getByText('No sources yet.')).toBeTruthy();
    for (const name of ['Add a partner', 'Add a milestone', 'Add a source']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});

describe('ProjectFields errors', () => {
  it.each([
    ['id', () => control('Id (required)')],
    ['title', () => projectTitle()],
    ['summary', () => control('Summary')],
    ['status', () => control('Status')],
    ['geo_scope', () => control('Geographic scope')],
    ['start_date', () => control('Start date')],
    ['end_date', () => control('End date')],
    ['lead_org.name', () => control('Lead organization name')],
    ['lead_org.url', () => control('Lead organization web address')],
    ['partners.0.name', () => control('Name (required)', group('Partner 1'))],
    ['partners.0.url', () => control('Web address', group('Partner 1'))],
    ['milestones.0.title', () => control('Title (required)', group('Milestone 1'))],
    ['milestones.0.date', () => control('Date', group('Milestone 1'))],
    ['sources.0.label', () => control('Label (required)', group('Source 1'))],
    ['sources.0.url', () => control('Web address (required)', group('Source 1'))],
    ['sources.0.last_verified', () => control('Last verified', group('Source 1'))],
  ])('shows the issue at %s on its control only', (path, target) => {
    renderFields({
      isNew: true,
      initial: stored,
      issues: [
        { path, message: `Problem at ${path}` },
        { path: 'other', message: 'Elsewhere' },
      ],
    });
    const element = target();
    expect(element.getAttribute('aria-invalid')).toBe('true');
    const errorId = `${element.id}-error`;
    expect(element.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(document.getElementById(errorId)!.textContent).toBe(`Error: Problem at ${path}`);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(1);
    expect(screen.queryByText(/Elsewhere/)).toBeNull();
  });

  it.each([
    ['related_counties', 'Counties'],
    ['modes', 'Modes'],
  ])('shows the issue at %s on the %s group', (path, name) => {
    renderFields({ initial: stored, issues: [{ path, message: `Problem at ${path}` }] });
    const fieldset = group(name);
    const errorId = `${fieldset.id}-error`;
    expect(fieldset.getAttribute('aria-describedby')?.split(' ')).toContain(errorId);
    expect(document.getElementById(errorId)!.textContent).toBe(`Error: Problem at ${path}`);
    expect(fieldset.contains(document.getElementById(errorId))).toBe(true);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it('keeps the hint beside an error on a text date', () => {
    renderFields({
      initial: { ...stored, start_date: 'Spring 2027' },
      issues: [{ path: 'start_date', message: 'Start date problem' }],
    });
    const start = control('Start date');
    expect(start.getAttribute('aria-describedby')).toBe(
      'project-start_date-hint project-start_date-error',
    );
  });

  it('does not show a row problem on the other row', () => {
    renderFields({
      initial: stored,
      issues: [{ path: 'sources.1.url', message: 'Second source problem' }],
    });
    expect(within(group('Source 1')).queryByText(/Second source problem/)).toBeNull();
    expect(within(group('Source 2')).getByText('Error: Second source problem')).toBeTruthy();
  });

  it('has no invalid control without issues', () => {
    renderFields({ isNew: true, initial: stored });
    expect(document.querySelector('[aria-invalid]')).toBeNull();
    expect(document.querySelector('.error')).toBeNull();
  });
});

describe('ProjectFields fields the form does not show', () => {
  it('names one unknown field', () => {
    renderFields({ initial: { ...stored, notes: 'n' } });
    expect(
      screen.getByText(
        'This project has 1 field the form does not show: notes. Use Edit as JSON to change them.',
      ),
    ).toBeTruthy();
  });

  it('names several unknown fields in stored order', () => {
    renderFields({ initial: { 'Extra Key': ['x'], ...stored, extra: 1 } });
    expect(
      screen.getByText(
        'This project has 2 fields the form does not show: Extra Key, extra. Use Edit as JSON to change them.',
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

describe('ProjectFields readonly', () => {
  it('disables every control while read-only', async () => {
    renderFields({ initial: stored, readonly: true });
    await tick();
    const controls = document.querySelectorAll<HTMLInputElement>(
      'form input, form textarea, form select, form button',
    );
    expect(controls.length).toBeGreaterThan(30);
    for (const element of controls) {
      expect(element.matches(':disabled')).toBe(true);
    }
  });

  it('leaves the controls enabled otherwise', () => {
    renderFields({ initial: stored });
    const controls = document.querySelectorAll<HTMLInputElement>(
      'form input, form textarea, form select, form button',
    );
    for (const element of controls) {
      expect(element.matches(':disabled')).toBe(false);
    }
  });
});
