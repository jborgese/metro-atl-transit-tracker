import { cleanup, render, screen } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentKind, ContentRecord } from '#lib/content/formModel/types.ts';
import type { Goal, Project, TimedAction } from '#types/content.ts';
import RecordPreview from './RecordPreview.svelte';

type Props = ComponentProps<typeof RecordPreview>;

const goals: Goal[] = [
  {
    id: 'g-active',
    goal: 'Active goal',
    related_project_ids: ['p-linked'],
    related_counties: [],
  },
  {
    id: 'g-archived',
    goal: 'Archived goal',
    related_project_ids: ['p-archived-link'],
    is_archived: true,
  },
];

const projects: Project[] = [
  { id: 'p-linked', title: 'Linked project', summary: 'Linked summary', status: 'planning' },
  {
    id: 'p-old',
    title: 'Retired project',
    summary: 'Old summary',
    status: 'completed',
    is_archived: true,
  },
];

const actions: TimedAction[] = [
  {
    id: 'ta-live',
    goal_id: 'g-active',
    description: 'Live ask',
    link: null,
    location: null,
    expires_on: '2026-12-10',
  },
];

const HELP: Record<ContentKind, string> = {
  project: 'How the project card will look on the site. It updates as you edit.',
  goal: 'How this goal will look on the site. It updates as you edit.',
  timed_action: 'How the action banner will look on the site. It updates as you edit.',
};
const PASSED = 'Its last day has passed, so it is not shown on the site.';
const NEEDS_LAST_DAY = 'It needs a last day before it can be shown.';
const NEEDS_GOAL = 'It needs an active goal before it can be shown.';
const NOT_LINKED =
  'No goal links to this project yet. Project cards appear under the goals that link to them.';

const validAction = { goal_id: 'g-active', description: 'Comment now', expires_on: '2026-12-01' };

function show(props: Partial<Props>) {
  return render(RecordPreview, {
    props: {
      kind: 'project',
      record: {},
      archived: false,
      isNew: false,
      goals,
      projects,
      actions,
      ...props,
    },
  });
}

const section = () => screen.getByRole('heading', { name: 'Preview' }).closest('section')!;
const frame = () => section().querySelector<HTMLElement>('.preview-frame')!;
const lines = () =>
  [...section().querySelectorAll(':scope > p')].map((line) => line.textContent?.trim());
const notes = () => lines().slice(1);
const inFrame = (selector: string) => frame().querySelector(selector)?.textContent?.trim();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-30T15:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RecordPreview layout', () => {
  it.each([
    ['project', { id: 'p-linked', title: 'Linked project' }, '.project-card'],
    ['goal', { id: 'g-active', goal: 'Active goal' }, '.goal-row'],
    ['timed_action', validAction, '.timed-action'],
  ] as const)('shows the %s heading, help line and an inert mock', (kind, record, mockSelector) => {
    show({ kind, record });
    expect(screen.getByRole('heading', { level: 3, name: 'Preview' })).toBeTruthy();
    expect(lines()[0]).toBe(HELP[kind]);
    expect(frame().hasAttribute('inert')).toBe(true);
    expect(frame().querySelector(mockSelector)).toBeTruthy();
    expect(frame().querySelector('.goals-table-preview')).toBeTruthy();
    expect(frame().querySelectorAll('p.help, p.note')).toHaveLength(0);
  });
});

describe('RecordPreview notes', () => {
  it.each([
    ['project', { id: 'p-linked', title: 'T' }, 'This project is archived'],
    ['goal', { id: 'g-active', goal: 'G' }, 'This goal is archived'],
    ['timed_action', validAction, 'This action is archived'],
  ] as const)('says an archived %s is not shown, and only then', async (kind, record, start) => {
    const { rerender } = show({ kind, record, archived: true });
    expect(notes()[0]).toBe(`${start}, so it is not shown on the site.`);
    await rerender({ archived: false });
    expect(notes().some((note) => note?.includes('archived'))).toBe(false);
  });

  it.each([
    ['2026-11-29', [PASSED]],
    ['2026-11-30', []],
    ['2026-12-01', []],
    ['', [NEEDS_LAST_DAY]],
    [undefined, [NEEDS_LAST_DAY]],
    ['2026-02-30', [NEEDS_LAST_DAY]],
    ['soon', [NEEDS_LAST_DAY]],
    [20261201, [NEEDS_LAST_DAY]],
  ])('for a last day of %s says %j', (expiresOn, expected) => {
    show({ kind: 'timed_action', record: { ...validAction, expires_on: expiresOn } });
    expect(notes()).toEqual(expected);
  });

  it('still draws the banner of an action whose last day has passed', () => {
    show({ kind: 'timed_action', record: { ...validAction, expires_on: '2026-11-29' } });
    expect(inFrame('.timed-action-body')).toBe('Comment now');
    expect(inFrame('.timed-action-tag')).toBe('Closes Nov. 29');
  });

  it('draws an action without a valid last day without its tag', () => {
    show({ kind: 'timed_action', record: { ...validAction, expires_on: '2026-02-30' } });
    expect(inFrame('.timed-action-body')).toBe('Comment now');
    expect(frame().querySelector('.timed-action-tag')).toBeNull();
  });

  it.each([
    ['blank', ''],
    ['missing', undefined],
    ['unknown', 'g-nope'],
    ['archived', 'g-archived'],
  ])('asks for an active goal when the goal is %s', (_case, goalId) => {
    show({ kind: 'timed_action', record: { ...validAction, goal_id: goalId } });
    expect(notes()).toEqual([NEEDS_GOAL]);
  });

  it('puts the archived, last-day and goal notes in that order', () => {
    show({
      kind: 'timed_action',
      archived: true,
      record: { goal_id: 'g-archived', expires_on: '2026-11-01' },
    });
    expect(notes()).toEqual([
      'This action is archived, so it is not shown on the site.',
      PASSED,
      NEEDS_GOAL,
    ]);
  });

  it.each([
    ['a new project', [NOT_LINKED], 'p-linked', true],
    ['a project no goal links to', [NOT_LINKED], 'p-unlinked', false],
    ['a project only an archived goal links to', [NOT_LINKED], 'p-archived-link', false],
    ['a project an active goal links to', [], 'p-linked', false],
  ] as const)('for %s says %j', (_case, expected, id, isNew) => {
    show({ kind: 'project', record: { id, title: 'T' }, isNew });
    expect(notes()).toEqual(expected);
  });

  it.each([
    [[], 'Listed under: Regional'],
    [undefined, 'Listed under: Regional'],
    [['13089'], 'Listed under: DeKalb'],
    [['13135', '99999', '13121'], 'Listed under: Fulton, Gwinnett'],
  ])('lists a goal with counties %j under where it appears', (counties, expected) => {
    show({ kind: 'goal', record: { id: 'g-active', goal: 'G', related_counties: counties } });
    expect(notes()).toEqual([expected]);
  });
});

describe('RecordPreview with incomplete or wrong data', () => {
  const wrong: ContentRecord = {
    id: 7,
    title: 42,
    summary: null,
    status: ['planning'],
    lead_org: ['MARTA'],
    sources: ['https://example.org', null, 5, { url: 9 }],
    goal: { text: 'x' },
    status_related_projects: 3,
    actions: null,
    related_orgs: ['Org A', null, { name: 5 }, { name: 'Real org', url: 3, contact_info: [] }],
    related_project_ids: [1, null, 'p-linked'],
    related_counties: '13121',
    goal_id: 5,
    description: { a: 1 },
    expires_on: 20261130,
    link: ['Submit', 'https://example.org'],
    location: 'City Hall',
  };

  function expectClean() {
    const html = section().innerHTML;
    const text = section().textContent ?? '';
    for (const bad of ['undefined', 'null', '[object Object]', 'NaN']) {
      expect(text).not.toContain(bad);
      expect(html).not.toContain(bad);
    }
  }

  it.each(['project', 'goal', 'timed_action'] as const)('renders an empty %s', (kind) => {
    show({ kind, record: {}, isNew: true });
    expect(frame().querySelector('tr')).toBeTruthy();
    expectClean();
  });

  it.each(['project', 'goal', 'timed_action'] as const)(
    'renders a %s full of wrong types',
    (kind) => {
      show({ kind, record: wrong });
      expect(frame().querySelector('tr')).toBeTruthy();
      expectClean();
    },
  );

  it('keeps only usable organizations, projects and sources from wrong data', () => {
    show({ kind: 'goal', record: wrong });
    expect(
      [...frame().querySelectorAll('.related-org')].map((org) => org.textContent?.trim()),
    ).toEqual(['Real org']);
    expect(inFrame('.project-title')).toBe('Linked project');
    cleanup();
    show({
      kind: 'project',
      record: {
        title: 'T',
        lead_org: { name: '  ', url: 'https://x.example' },
        sources: [{ label: 'Plan', url: '  ' }],
      },
    });
    expect(frame().querySelector('.project-org')).toBeNull();
    expect(frame().querySelector('.project-source-link')).toBeNull();
  });

  it('leaves out a half-filled link and location', () => {
    show({
      kind: 'timed_action',
      record: {
        ...validAction,
        link: { label: 'Submit', url: '' },
        location: { label: '', address: '55 Trinity Ave SW' },
      },
    });
    expect(frame().querySelectorAll('.timed-action-button')).toHaveLength(0);
  });
});

describe('RecordPreview updates', () => {
  it('shows only active projects under a goal, with its live banners', () => {
    show({
      kind: 'goal',
      record: { id: 'g-active', goal: 'Active goal', related_project_ids: ['p-linked', 'p-old'] },
    });
    expect([...frame().querySelectorAll('.project-title')].map((n) => n.textContent)).toEqual([
      'Linked project',
    ]);
    expect(inFrame('.timed-action-body')).toBe('Live ask');
  });

  it('shows no banners for a new goal', () => {
    show({ kind: 'goal', record: { id: 'g-active', goal: 'Active goal' }, isNew: true });
    expect(frame().querySelector('.timed-action')).toBeNull();
  });

  it('follows the project record as it changes', async () => {
    const { rerender } = show({
      kind: 'project',
      record: { id: 'p-linked', title: 'First title', status: 'planning' },
    });
    expect([inFrame('.project-title'), inFrame('.project-status')]).toEqual([
      'First title',
      'Planning',
    ]);
    await rerender({ record: { id: 'p-linked', title: 'Second title', status: 'ongoing' } });
    expect([inFrame('.project-title'), inFrame('.project-status')]).toEqual([
      'Second title',
      'Ongoing',
    ]);
  });

  it('follows the action record as it changes', async () => {
    const { rerender } = show({ kind: 'timed_action', record: validAction });
    expect(inFrame('.timed-action-body')).toBe('Comment now');
    expect(frame().querySelector('.timed-action-button')).toBeNull();
    await rerender({
      record: {
        ...validAction,
        description: 'Comment today',
        link: { label: 'Submit a comment', url: 'https://example.org/comment' },
      },
    });
    expect(inFrame('.timed-action-body')).toBe('Comment today');
    expect(inFrame('.timed-action-button')).toBe('Submit a comment');
  });

  it('follows the goal record as it changes', async () => {
    const { rerender } = show({ kind: 'goal', record: { id: 'g-active', goal: 'First goal' } });
    expect(inFrame('.goal-row td')).toBe('First goal');
    await rerender({
      record: { id: 'g-active', goal: 'Second goal', related_counties: ['13067'] },
    });
    expect(inFrame('.goal-row td')).toBe('Second goal');
    expect(notes()).toEqual(['Listed under: Cobb']);
  });
});
