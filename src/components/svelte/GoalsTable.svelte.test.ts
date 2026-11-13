import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import GoalsTable from './GoalsTable.svelte';
import type { Goal, Project } from './types';

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

describe('GoalsTable', () => {
  it('renders each goal once per table with its project card, no county selected', () => {
    const { container } = render(GoalsTable, { props: { goals, projects } });
    expect(container.querySelectorAll('tr.goal-row')).toHaveLength(2);
    expect(container.querySelectorAll('.project-card')).toHaveLength(2);
  });

  it('renders the selected county then regional', () => {
    const { container } = render(GoalsTable, {
      props: { goals, projects, selectedCounty: '13121' },
    });
    expect(container.querySelectorAll('tr.goal-row')).toHaveLength(2);
    expect(container.querySelectorAll('.project-card')).toHaveLength(2);
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
});
