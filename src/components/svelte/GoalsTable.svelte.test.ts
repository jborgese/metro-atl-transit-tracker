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
