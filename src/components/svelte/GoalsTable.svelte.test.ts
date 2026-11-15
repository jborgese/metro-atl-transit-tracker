import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import GoalsTable from './GoalsTable.svelte';
import type { Goal, Project, TimedAction } from './types';
import { mapsSearchUrl } from '#utils/timedActions.ts';

const projects = [
  { id: 'p1', title: 'Proj One', summary: 's', status: 'planning' },
] as unknown as Project[];

const org = { name: 'Org A', url: 'https://a.example', contact_info: 'call first' };

const goals = [
  {
    id: 'g1',
    goal: 'Regional goal',
    related_counties: [],
    related_project_ids: ['p1'],
    related_orgs: [org],
  },
  {
    id: 'g2',
    goal: 'County goal',
    related_counties: ['13121'],
    related_project_ids: ['p1'],
    related_orgs: [org],
  },
] as unknown as Goal[];

const firstCells = (container: HTMLElement) =>
  [...container.querySelectorAll('tr.goal-row td:first-child')].map((n) => n.textContent?.trim());

describe('GoalsTable', () => {
  it('renders each goal once per table with its project card, no county selected', () => {
    const { container } = render(GoalsTable, { props: { goals, projects } });
    expect(container.querySelectorAll('tr.goal-row')).toHaveLength(2);
    expect(container.querySelectorAll('.project-card')).toHaveLength(2);
    expect(firstCells(container)).toEqual(['Regional goal', 'County goal']);
  });

  it('renders the selected county then regional', () => {
    const { container } = render(GoalsTable, {
      props: { goals, projects, selectedCounty: '13121' },
    });
    expect(container.querySelectorAll('tr.goal-row')).toHaveLength(2);
    expect(container.querySelectorAll('.project-card')).toHaveLength(2);
    expect(firstCells(container)).toEqual(['County goal', 'Regional goal']);
    const infos = [...container.querySelectorAll('.contact-info')].map((n) =>
      n.textContent?.trim(),
    );
    expect(infos).toEqual(['(call first)', '(call first)']);
  });

  it('opens a project on click', async () => {
    const onselectProject = vi.fn();
    const { container } = render(GoalsTable, { props: { goals, projects, onselectProject } });
    await fireEvent.click(container.querySelector('.project-card')!);
    expect(onselectProject).toHaveBeenCalledWith({ project: projects[0] });
  });

  it('opens a project from the keyboard', async () => {
    const onselectProject = vi.fn();
    const { container } = render(GoalsTable, { props: { goals, projects, onselectProject } });
    await fireEvent.keyDown(container.querySelector('.project-card')!, { key: 'Enter' });
    expect(onselectProject).toHaveBeenCalledWith({ project: projects[0] });
  });

  it('wraps org contact info in parentheses in every table', () => {
    const { container } = render(GoalsTable, { props: { goals, projects } });
    const infos = [...container.querySelectorAll('.contact-info')].map((n) =>
      n.textContent?.trim(),
    );
    expect(infos).toEqual(['(call first)', '(call first)']);
  });

  describe('timed actions', () => {
    const now = new Date('2026-11-30T15:00:00Z');
    const base: TimedAction = {
      id: 'ta-aaaaaaaa',
      goal_id: 'g1',
      description: 'Comment on the study.',
      link: null,
      location: null,
      expires_on: '2026-11-30',
    };

    it('shows link and location buttons and the last-day tag', () => {
      const action = {
        ...base,
        link: { label: 'Submit a comment', url: 'https://beltline.org/x' },
        location: { label: 'Murphy Crossing site', address: '1050 Murphy Ave SW, Atlanta, GA' },
      };
      render(GoalsTable, { props: { goals, projects, timedActions: [action], now } });
      expect(screen.getByText('Act now')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Submit a comment' }).getAttribute('href')).toBe(
        'https://beltline.org/x',
      );
      const pin = screen.getByRole('link', { name: 'Map: Murphy Crossing site' });
      expect(pin.getAttribute('href')).toBe(mapsSearchUrl('1050 Murphy Ave SW, Atlanta, GA'));
      expect(pin.getAttribute('target')).toBe('_blank');
      expect(pin.getAttribute('rel')).toContain('noopener');
      expect(pin.getAttribute('rel')).toContain('noreferrer');
      expect(screen.getByText('Expires today')).toBeTruthy();
    });

    it('renders only the link button when there is no location', () => {
      const action = {
        ...base,
        link: { label: 'Submit a comment', url: 'https://beltline.org/x' },
      };
      render(GoalsTable, { props: { goals, projects, timedActions: [action], now } });
      const links = document.querySelectorAll('.timed-action a');
      expect(links).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Submit a comment' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: /^Map:/ })).toBeNull();
    });

    it('renders only the map button when there is no link', () => {
      const action = {
        ...base,
        location: { label: 'Murphy Crossing site', address: '1050 Murphy Ave SW, Atlanta, GA' },
      };
      render(GoalsTable, { props: { goals, projects, timedActions: [action], now } });
      expect(document.querySelectorAll('.timed-action a')).toHaveLength(1);
      expect(
        screen.getByRole('link', { name: 'Map: Murphy Crossing site' }).getAttribute('href'),
      ).toBe(mapsSearchUrl('1050 Murphy Ave SW, Atlanta, GA'));
    });

    it('renders text only when there is no link or location', () => {
      const { container } = render(GoalsTable, {
        props: { goals, projects, timedActions: [base], now },
      });
      expect(container.querySelectorAll('.timed-action a')).toHaveLength(0);
    });

    it('hides expired, archived and goal-less actions', () => {
      const actions = [
        { ...base, id: 'ta-expired1', expires_on: '2026-11-29' },
        { ...base, id: 'ta-archived', is_archived: true },
        { ...base, id: 'ta-orphan01', goal_id: 'no-such-goal' },
      ];
      const { container } = render(GoalsTable, {
        props: { goals, projects, timedActions: actions, now },
      });
      expect(container.querySelectorAll('.timed-action')).toHaveLength(0);
    });

    it('orders several actions soonest first, above project cards', () => {
      const actions = [
        { ...base, id: 'ta-later000', description: 'Later', expires_on: '2026-12-10' },
        { ...base, id: 'ta-sooner00', description: 'Sooner', expires_on: '2026-12-01' },
      ];
      const { container } = render(GoalsTable, {
        props: { goals, projects, timedActions: actions, now },
      });
      const rows = [...container.querySelectorAll('tbody')[0]!.children].map(
        (r) => r.className.split(' ')[0],
      );
      expect(rows).toEqual(['goal-row', 'timed-action-row', 'timed-action-row', 'project-row']);
      const texts = [...container.querySelectorAll('.timed-action-body')].map((n) => n.textContent);
      expect(texts[0]).toContain('Sooner');
    });

    it('renders editor text literally', () => {
      render(GoalsTable, {
        props: {
          goals,
          projects,
          timedActions: [{ ...base, description: '<b>Bold</b> & more' }],
          now,
        },
      });
      expect(screen.getByText('<b>Bold</b> & more')).toBeTruthy();
    });
  });

  it('labels the third column Ongoing actions', () => {
    const { container } = render(GoalsTable, { props: { goals, projects } });
    const third = [...container.querySelectorAll('thead tr')].map(
      (tr) => tr.children[2]?.textContent,
    );
    expect(new Set(third)).toEqual(new Set(['Ongoing actions']));
    expect(container.querySelectorAll('td[data-label="Ongoing actions"]').length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('td[data-label="Actions"]')).toHaveLength(0);
  });
});

describe('GoalsTable public output', () => {
  const now = new Date('2026-11-30T15:00:00Z');
  const publicProjects = [
    {
      id: 'p1',
      title: 'Proj One',
      summary: 'First summary',
      status: 'planning',
      lead_org: { name: 'MARTA', url: 'https://itsmarta.com/' },
      sources: [{ label: 'Plan', url: 'https://example.org/plan' }],
    },
    {
      id: 'p2',
      title: 'Proj Two',
      summary: 'Second summary',
      status: 'implementation',
      lead_org: { name: 'GDOT' },
      sources: [],
    },
    { id: 'p3', title: 'Proj Three', summary: 'Third summary', status: 'on-hold' },
  ] as unknown as Project[];
  const publicGoals = [
    {
      id: 'g1',
      goal: 'Regional goal',
      status_related_projects: 'See https://example.org/status/a/b, then wait.',
      actions: 'Show up',
      related_counties: [],
      related_project_ids: ['p1', 'p2'],
      related_orgs: [
        { name: 'Org A', url: 'https://a.example', contact_info: 'call first' },
        { name: 'Org B' },
      ],
    },
    {
      id: 'g2',
      goal: 'Fulton goal',
      related_counties: ['13121'],
      related_project_ids: ['p3'],
      related_orgs: [],
    },
    {
      id: 'g3',
      goal: 'Cobb and DeKalb goal',
      actions: 'Write in',
      related_counties: ['13067', '13089'],
      related_project_ids: [],
    },
  ] as unknown as Goal[];
  const publicActions: TimedAction[] = [
    {
      id: 'ta-live-link',
      goal_id: 'g1',
      description: 'Comment on the study.',
      link: { label: 'Submit a comment', url: 'https://beltline.org/x' },
      location: { label: 'Murphy Crossing site', address: '1050 Murphy Ave SW, Atlanta, GA' },
      expires_on: '2026-12-10',
    },
    {
      id: 'ta-today',
      goal_id: 'g1',
      description: 'Last chance today.',
      link: null,
      location: null,
      expires_on: '2026-11-30',
    },
    {
      id: 'ta-expired',
      goal_id: 'g2',
      description: 'Already closed.',
      link: null,
      location: null,
      expires_on: '2026-11-29',
    },
    {
      id: 'ta-archived',
      goal_id: 'g2',
      description: 'Archived ask.',
      link: null,
      location: null,
      expires_on: '2026-12-15',
      is_archived: true,
    },
    {
      id: 'ta-next-year',
      goal_id: 'g2',
      description: 'Testify next year.',
      link: null,
      location: { label: 'City Hall', address: '55 Trinity Ave SW, Atlanta, GA' },
      expires_on: '2027-01-05',
    },
  ];

  it('renders the same markup as before the preview mode was added', () => {
    const { container } = render(GoalsTable, {
      props: { goals: publicGoals, projects: publicProjects, timedActions: publicActions, now },
    });
    const markup = container.innerHTML.replaceAll('<!---->', '').replaceAll('><', '>\n<');
    expect(markup).toMatchInlineSnapshot(`
      "<div class="goals-table svelte-1m2rtvo">
      <div class="goals-nav svelte-1m2rtvo">
      <nav class="county-jump svelte-1m2rtvo" aria-label="Jump to section">
      <a href="#section-regional" class="svelte-1m2rtvo">Regional</a> <a class="svelte-1m2rtvo" href="#section-13121">Fulton</a>
      <a class="svelte-1m2rtvo" href="#section-13089">DeKalb</a>
      <a class="svelte-1m2rtvo" href="#section-13067">Cobb</a>
      <a class="svelte-1m2rtvo" href="#section-13135">Gwinnett</a>
      <a class="svelte-1m2rtvo" href="#section-13063">Clayton</a>
      <a class="svelte-1m2rtvo" href="#section-13151">Henry</a>
      </nav> </div> <div class="county-section svelte-1m2rtvo" id="section-regional">
      <h2 class="county-header svelte-1m2rtvo">Regional <span class="goal-count svelte-1m2rtvo">(1)</span>
      </h2> <div class="table-scroll svelte-1m2rtvo">
      <table class="data-table goals-data-table svelte-1m2rtvo">
      <thead class="svelte-1m2rtvo">
      <tr>
      <th>Goal</th>
      <th>Status</th>
      <th>Ongoing actions</th>
      <th>Orgs</th>
      </tr>
      </thead>
      <tbody class="svelte-1m2rtvo">
      <tr class="goal-row svelte-1m2rtvo">
      <td data-label="Goal" class="svelte-1m2rtvo">Regional goal</td>
      <td data-label="Status" class="svelte-1m2rtvo">See <a target="_blank" rel="noopener noreferrer" class="svelte-1m2rtvo" href="https://example.org/status/a/b">example.org/status/...</a>, then wait.</td>
      <td data-label="Ongoing actions" class="svelte-1m2rtvo">Show up</td>
      <td data-label="Orgs" class="svelte-1m2rtvo">
      <div class="related-org svelte-1m2rtvo">
      <a target="_blank" rel="noopener noreferrer" class="svelte-1m2rtvo" href="https://a.example">Org A</a> <span class="contact-info svelte-1m2rtvo">(call first)</span>
      </div>
      <div class="related-org svelte-1m2rtvo">
      <span>Org B</span> </div>
      </td>
      </tr> <tr class="timed-action-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="timed-action svelte-1m2rtvo">
      <span class="timed-action-label svelte-1m2rtvo">Act now</span> <div class="timed-action-content svelte-1m2rtvo">
      <div class="timed-action-body svelte-1m2rtvo">Last chance today.</div>   <span class="timed-action-tag svelte-1m2rtvo is-today">Expires today</span>
      </div>
      </div>
      </td>
      </tr>
      <tr class="timed-action-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="timed-action svelte-1m2rtvo">
      <span class="timed-action-label svelte-1m2rtvo">Act now</span> <div class="timed-action-content svelte-1m2rtvo">
      <div class="timed-action-body svelte-1m2rtvo">Comment on the study.</div> <a class="timed-action-button svelte-1m2rtvo" target="_blank" rel="noopener noreferrer external" href="https://beltline.org/x">Submit a comment <svg viewBox="0 0 24 24" aria-hidden="true" class="svelte-1m2rtvo">
      <path d="M7 17 17 7M8 7h9v9">
      </path>
      </svg>
      </a> <a class="timed-action-button svelte-1m2rtvo" target="_blank" rel="noopener noreferrer external" href="https://www.google.com/maps/search/?api=1&amp;query=1050%20Murphy%20Ave%20SW%2C%20Atlanta%2C%20GA" aria-label="Map: Murphy Crossing site">
      <svg viewBox="0 0 24 24" aria-hidden="true" class="svelte-1m2rtvo">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z">
      </path>
      <circle cx="12" cy="10" r="2.5">
      </circle>
      </svg> Murphy Crossing site</a> <span class="timed-action-tag svelte-1m2rtvo">Closes Dec. 10</span>
      </div>
      </div>
      </td>
      </tr> <tr class="project-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="project-card svelte-1m2rtvo" role="button" tabindex="0" aria-label="View details for Proj One" style="--status-color: #4280c4;">
      <div class="project-header svelte-1m2rtvo">
      <span class="project-indicator svelte-1m2rtvo" aria-hidden="true">→</span> <span class="project-title svelte-1m2rtvo">Proj One</span> <span class="project-status svelte-1m2rtvo" style="background: rgb(66, 128, 196); color: rgb(31, 31, 31);">Planning</span>
      </div> <p class="project-summary svelte-1m2rtvo">First summary</p> <div class="project-org svelte-1m2rtvo">
      <span class="org-label svelte-1m2rtvo">Lead:</span> <a target="_blank" rel="noopener noreferrer" class="svelte-1m2rtvo" href="https://itsmarta.com/">MARTA</a>
      </div> <div class="project-card-footer svelte-1m2rtvo">
      <span class="project-card-hint svelte-1m2rtvo">View details</span> <a class="project-source-link svelte-1m2rtvo" target="_blank" rel="noopener noreferrer" href="https://example.org/plan">View source →</a>
      </div>
      </div>
      </td>
      </tr>
      <tr class="project-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="project-card svelte-1m2rtvo" role="button" tabindex="0" aria-label="View details for Proj Two" style="--status-color: #c4a042;">
      <div class="project-header svelte-1m2rtvo">
      <span class="project-indicator svelte-1m2rtvo" aria-hidden="true">→</span> <span class="project-title svelte-1m2rtvo">Proj Two</span> <span class="project-status svelte-1m2rtvo" style="background: rgb(196, 160, 66); color: rgb(31, 31, 31);">Implementation</span>
      </div> <p class="project-summary svelte-1m2rtvo">Second summary</p> <div class="project-org svelte-1m2rtvo">
      <span class="org-label svelte-1m2rtvo">Lead:</span> <span>GDOT</span>
      </div> <div class="project-card-footer svelte-1m2rtvo">
      <span class="project-card-hint svelte-1m2rtvo">View details</span> </div>
      </div>
      </td>
      </tr>
      </tbody>
      </table>
      </div>
      </div> <div class="county-section svelte-1m2rtvo" id="section-13121">
      <h2 class="county-header svelte-1m2rtvo">Fulton County <span class="goal-count svelte-1m2rtvo">(1)</span>
      </h2> <div class="table-scroll svelte-1m2rtvo">
      <table class="data-table goals-data-table svelte-1m2rtvo">
      <thead class="svelte-1m2rtvo">
      <tr>
      <th>Goal</th>
      <th>Status/Related Projects</th>
      <th>Ongoing actions</th>
      <th>Related Orgs</th>
      </tr>
      </thead>
      <tbody class="svelte-1m2rtvo">
      <tr class="goal-row svelte-1m2rtvo">
      <td data-label="Goal" class="svelte-1m2rtvo">Fulton goal</td>
      <td data-label="Status" class="svelte-1m2rtvo">
      </td>
      <td data-label="Ongoing actions" class="svelte-1m2rtvo">
      </td>
      <td data-label="Orgs" class="svelte-1m2rtvo">
      </td>
      </tr> <tr class="timed-action-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="timed-action svelte-1m2rtvo">
      <span class="timed-action-label svelte-1m2rtvo">Act now</span> <div class="timed-action-content svelte-1m2rtvo">
      <div class="timed-action-body svelte-1m2rtvo">Testify next year.</div>  <a class="timed-action-button svelte-1m2rtvo" target="_blank" rel="noopener noreferrer external" href="https://www.google.com/maps/search/?api=1&amp;query=55%20Trinity%20Ave%20SW%2C%20Atlanta%2C%20GA" aria-label="Map: City Hall">
      <svg viewBox="0 0 24 24" aria-hidden="true" class="svelte-1m2rtvo">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z">
      </path>
      <circle cx="12" cy="10" r="2.5">
      </circle>
      </svg> City Hall</a> <span class="timed-action-tag svelte-1m2rtvo">Closes Jan. 5, 2027</span>
      </div>
      </div>
      </td>
      </tr> <tr class="project-row svelte-1m2rtvo">
      <td class="nested-cell svelte-1m2rtvo" colspan="4">
      <div class="project-card svelte-1m2rtvo" role="button" tabindex="0" aria-label="View details for Proj Three" style="--status-color: #4280c4;">
      <div class="project-header svelte-1m2rtvo">
      <span class="project-indicator svelte-1m2rtvo" aria-hidden="true">→</span> <span class="project-title svelte-1m2rtvo">Proj Three</span> <span class="project-status svelte-1m2rtvo" style="background: rgb(66, 128, 196); color: rgb(255, 255, 255);">on-hold</span>
      </div> <p class="project-summary svelte-1m2rtvo">Third summary</p>  <div class="project-card-footer svelte-1m2rtvo">
      <span class="project-card-hint svelte-1m2rtvo">View details</span> </div>
      </div>
      </td>
      </tr>
      </tbody>
      </table>
      </div>
      </div>
      <div class="county-section svelte-1m2rtvo" id="section-13089">
      <h2 class="county-header svelte-1m2rtvo">DeKalb County <span class="goal-count svelte-1m2rtvo">(1)</span>
      </h2> <div class="table-scroll svelte-1m2rtvo">
      <table class="data-table goals-data-table svelte-1m2rtvo">
      <thead class="svelte-1m2rtvo">
      <tr>
      <th>Goal</th>
      <th>Status/Related Projects</th>
      <th>Ongoing actions</th>
      <th>Related Orgs</th>
      </tr>
      </thead>
      <tbody class="svelte-1m2rtvo">
      <tr class="goal-row svelte-1m2rtvo">
      <td data-label="Goal" class="svelte-1m2rtvo">Cobb and DeKalb goal</td>
      <td data-label="Status" class="svelte-1m2rtvo">
      </td>
      <td data-label="Ongoing actions" class="svelte-1m2rtvo">Write in</td>
      <td data-label="Orgs" class="svelte-1m2rtvo">
      </td>
      </tr>  </tbody>
      </table>
      </div>
      </div>
      <div class="county-section svelte-1m2rtvo" id="section-13067">
      <h2 class="county-header svelte-1m2rtvo">Cobb County <span class="goal-count svelte-1m2rtvo">(1)</span>
      </h2> <div class="table-scroll svelte-1m2rtvo">
      <table class="data-table goals-data-table svelte-1m2rtvo">
      <thead class="svelte-1m2rtvo">
      <tr>
      <th>Goal</th>
      <th>Status/Related Projects</th>
      <th>Ongoing actions</th>
      <th>Related Orgs</th>
      </tr>
      </thead>
      <tbody class="svelte-1m2rtvo">
      <tr class="goal-row svelte-1m2rtvo">
      <td data-label="Goal" class="svelte-1m2rtvo">Cobb and DeKalb goal</td>
      <td data-label="Status" class="svelte-1m2rtvo">
      </td>
      <td data-label="Ongoing actions" class="svelte-1m2rtvo">Write in</td>
      <td data-label="Orgs" class="svelte-1m2rtvo">
      </td>
      </tr>  </tbody>
      </table>
      </div>
      </div>
      <div class="county-section svelte-1m2rtvo" id="section-13135">
      <h2 class="county-header svelte-1m2rtvo">Gwinnett County </h2> <p class="no-goals-message svelte-1m2rtvo">No goal information is available for this county.</p>
      </div>
      <div class="county-section svelte-1m2rtvo" id="section-13063">
      <h2 class="county-header svelte-1m2rtvo">Clayton County </h2> <p class="no-goals-message svelte-1m2rtvo">No goal information is available for this county.</p>
      </div>
      <div class="county-section svelte-1m2rtvo" id="section-13151">
      <h2 class="county-header svelte-1m2rtvo">Henry County </h2> <p class="no-goals-message svelte-1m2rtvo">No goal information is available for this county.</p>
      </div>
      </div>"
    `);
  });
});

describe('GoalsTable preview', () => {
  const now = new Date('2026-11-30T15:00:00Z');
  const card = {
    id: 'p1',
    title: 'Proj One',
    summary: 'What it is',
    status: 'implementation',
    lead_org: { name: 'MARTA', url: 'https://itsmarta.com/' },
    sources: [{ label: 'Plan', url: 'https://example.org/plan' }],
  } as Project;
  const banner: TimedAction = {
    id: 'ta-preview',
    goal_id: 'g1',
    description: 'Comment on the study.',
    link: { label: 'Submit a comment', url: 'https://beltline.org/x' },
    location: { label: 'Murphy Crossing site', address: '1050 Murphy Ave SW, Atlanta, GA' },
    expires_on: '2026-12-10',
  };
  const rowClasses = (container: HTMLElement) =>
    [...container.querySelectorAll('tbody > tr')].map((row) => row.className.split(' ')[0]);

  function expectOnlyThePreview(container: HTMLElement) {
    const root = container.firstElementChild!;
    expect(root.classList.contains('goals-table')).toBe(true);
    expect(root.classList.contains('goals-table-preview')).toBe(true);
    expect(container.querySelector('.goals-nav')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(container.querySelectorAll('h2, .county-section')).toHaveLength(0);
    expect(container.querySelectorAll('table')).toHaveLength(1);
  }

  it('shows only a goal with its live banner and its related project card', () => {
    const { container } = render(GoalsTable, {
      props: {
        preview: { goal: goals[0]! },
        projects,
        timedActions: [
          banner,
          { ...banner, id: 'ta-expired', description: 'Closed ask', expires_on: '2026-11-29' },
          { ...banner, id: 'ta-other', goal_id: 'g2', description: 'Other goal ask' },
        ],
        now,
      },
    });
    expectOnlyThePreview(container);
    expect(
      [...container.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim()),
    ).toEqual(['Goal', 'Status', 'Ongoing actions', 'Orgs']);
    expect(rowClasses(container)).toEqual(['goal-row', 'timed-action-row', 'project-row']);
    expect(firstCells(container)).toEqual(['Regional goal']);
    expect(container.querySelector('.timed-action-body')!.textContent).toBe(
      'Comment on the study.',
    );
    expect(container.querySelector('.project-title')!.textContent).toBe('Proj One');
  });

  it('shows only an action banner with its link, location and tag', () => {
    const { container } = render(GoalsTable, { props: { preview: { action: banner }, now } });
    expectOnlyThePreview(container);
    expect(container.querySelector('thead')).toBeNull();
    expect(rowClasses(container)).toEqual(['timed-action-row']);
    expect(screen.getByText('Act now')).toBeTruthy();
    expect(screen.getByText('Comment on the study.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Submit a comment' }).getAttribute('href')).toBe(
      'https://beltline.org/x',
    );
    expect(
      screen.getByRole('link', { name: 'Map: Murphy Crossing site' }).getAttribute('href'),
    ).toBe(mapsSearchUrl('1050 Murphy Ave SW, Atlanta, GA'));
    expect(container.querySelector('.timed-action-tag')!.textContent).toBe('Closes Dec. 10');
  });

  it('draws an action banner without a tag when it has no last day', () => {
    const { container } = render(GoalsTable, {
      props: { preview: { action: { ...banner, expires_on: '' } }, now },
    });
    expect(container.querySelector('.timed-action-body')!.textContent).toBe(
      'Comment on the study.',
    );
    expect(container.querySelector('.timed-action-tag')).toBeNull();
  });

  it('shows only a project card with its title, status, summary, lead and source', () => {
    const { container } = render(GoalsTable, { props: { preview: { project: card }, now } });
    expectOnlyThePreview(container);
    expect(container.querySelector('thead')).toBeNull();
    expect(rowClasses(container)).toEqual(['project-row']);
    expect(
      [
        '.project-title',
        '.project-status',
        '.project-summary',
        '.project-org',
        '.project-source-link',
      ].map((selector) => container.querySelector(selector)?.textContent?.trim()),
    ).toEqual(['Proj One', 'Implementation', 'What it is', 'Lead: MARTA', 'View source →']);
    expect(screen.getByRole('link', { name: 'MARTA' }).getAttribute('href')).toBe(
      'https://itsmarta.com/',
    );
    expect(screen.getByRole('link', { name: 'View source →' }).getAttribute('href')).toBe(
      'https://example.org/plan',
    );
  });

  it('leaves out View source when the first source has no web address', () => {
    render(GoalsTable, {
      props: {
        preview: {
          project: {
            ...card,
            sources: [
              { label: 'Plan', url: '' },
              { label: 'News', url: 'https://example.org/news' },
            ],
          },
        },
        now,
      },
    });
    expect(screen.getByText('Proj One')).toBeTruthy();
    expect(screen.queryByText('View source →')).toBeNull();
  });
});
