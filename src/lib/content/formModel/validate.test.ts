import { describe, expect, it } from 'vitest';
import { fieldId, fieldLabel } from './labels';
import { validatePayload, type ValidationContext } from './validate';

const context: ValidationContext = {
  today: '2026-11-14',
  goals: [{ id: 'g1' }, { id: 'g2', is_archived: true }],
  existingIds: ['p1'],
  loaded: null,
};

const actionBody = {
  goal_id: 'g1',
  description: 'D',
  link: null,
  location: null,
  expires_on: '2026-11-20',
};

const only = (path: string, message: string) => [{ path, message }];

describe('validatePayload', () => {
  it('reports every problem at once in plain words', () => {
    expect(
      validatePayload(
        'project',
        'create',
        { id: 'Bad Id', title: '', sources: [{ label: 'L', url: 'nope' }] },
        context,
      ),
    ).toEqual([
      { path: 'id', message: 'Use lowercase letters, numbers and hyphens only' },
      { path: 'title', message: 'Enter a title' },
      {
        path: 'sources.0.url',
        message: 'Source 1 web address: enter a full web address starting with https://',
      },
    ]);
  });

  it('names a half-filled row', () => {
    expect(
      validatePayload('project', 'update', { sources: [{ label: 'Only a label' }] }, context),
    ).toEqual([{ path: 'sources.0.url', message: 'Source 1 web address: enter a value' }]);
  });

  it('applies the context rules', () => {
    const body = {
      goal_id: 'g2',
      description: 'D',
      link: { label: 'Go', url: '' },
      location: null,
      expires_on: '2026-11-13',
    };
    expect(validatePayload('timed_action', 'create', body, context)).toEqual([
      {
        path: 'link.url',
        message: 'Link web address: enter a full web address starting with https://',
      },
      { path: 'expires_on', message: 'Last day must be between 2026-11-14 and 2027-11-15' },
      { path: 'goal_id', message: 'Choose a goal that is not archived' },
    ]);
    expect(validatePayload('project', 'create', { id: 'p1', title: 'T' }, context)).toEqual([
      { path: 'id', message: 'A project with this id already exists, including archived ones' },
    ]);
  });

  it('leaves an unchanged past date alone on an edit', () => {
    const loaded = { ...actionBody, expires_on: '2026-11-01' };
    expect(
      validatePayload(
        'timed_action',
        'update',
        { ...loaded, description: 'E' },
        { ...context, loaded },
      ),
    ).toEqual([]);
  });

  it('limits the description to 300 characters', () => {
    const body = { ...actionBody, description: 'x'.repeat(301) };
    expect(validatePayload('timed_action', 'create', body, context)).toEqual([
      { path: 'description', message: 'Description must be 300 characters or fewer' },
    ]);
  });

  describe('goal rule on an edit', () => {
    const loaded = { ...actionBody, goal_id: 'g2' };
    const edit = (body: Record<string, unknown>) =>
      validatePayload('timed_action', 'update', body, { ...context, loaded });

    it('skips an unchanged archived goal', () => {
      expect(edit({ ...loaded, description: 'E' })).toEqual([]);
    });

    it('checks a goal that was changed', () => {
      expect(edit({ ...loaded, goal_id: 'g2x' })).toEqual(only('goal_id', 'Choose a goal'));
      expect(
        validatePayload(
          'timed_action',
          'update',
          { ...actionBody, goal_id: 'g2' },
          { ...context, loaded: { ...actionBody, goal_id: 'g1' } },
        ),
      ).toEqual(only('goal_id', 'Choose a goal that is not archived'));
    });
  });

  describe('lead organisation', () => {
    it('reports a blanked name on update exactly once, replacing the schema issue', () => {
      expect(
        validatePayload(
          'project',
          'update',
          { lead_org: { name: '' } },
          { ...context, loaded: { lead_org: { name: 'A' } } },
        ),
      ).toEqual(
        only(
          'lead_org.name',
          "Enter the lead organisation's name. It can be changed but not removed.",
        ),
      );
    });

    it('reports a missing name on update', () => {
      expect(
        validatePayload(
          'project',
          'update',
          { lead_org: { url: 'https://a.example' } },
          { ...context, loaded: { lead_org: { name: 'A' } } },
        ),
      ).toEqual(
        only(
          'lead_org.name',
          "Enter the lead organisation's name. It can be changed but not removed.",
        ),
      );
    });

    it('uses the row wording on create', () => {
      expect(
        validatePayload(
          'project',
          'create',
          { id: 'p2', title: 'T', lead_org: { name: '', url: 'https://a.example' } },
          context,
        ),
      ).toEqual(only('lead_org.name', 'Lead organisation name: enter a value'));
    });
  });

  describe('remaining message rows', () => {
    it('rejects a date that does not exist', () => {
      expect(
        validatePayload(
          'timed_action',
          'create',
          { ...actionBody, expires_on: '2026-02-30' },
          context,
        ),
      ).toEqual(only('expires_on', 'Last day: enter a real date'));
    });

    it('rejects credentials in a link', () => {
      const link = { label: 'Go', url: 'https://user:pw@a.example' };
      expect(validatePayload('timed_action', 'create', { ...actionBody, link }, context)).toEqual(
        only('link.url', 'Link web address: remove the username and password from the web address'),
      );
    });

    it('rejects ill-formed text', () => {
      expect(
        validatePayload(
          'timed_action',
          'create',
          { ...actionBody, description: '\uD800' },
          context,
        ),
      ).toEqual(
        only('description', 'Description contains a character that cannot be saved; retype it'),
      );
    });

    it('rejects extra keys on an action', () => {
      expect(
        validatePayload('timed_action', 'create', { ...actionBody, extra: 1, other: 2 }, context),
      ).toEqual(only('', 'Actions cannot have other fields: extra, other'));
    });

    it('limits label and address length', () => {
      const body = {
        ...actionBody,
        link: { label: 'x'.repeat(41), url: 'https://a.example' },
        location: { label: 'L', address: 'x'.repeat(201) },
      };
      expect(validatePayload('timed_action', 'create', body, context)).toEqual([
        { path: 'link.label', message: 'Link button label must be 40 characters or fewer' },
        { path: 'location.address', message: 'Address must be 200 characters or fewer' },
      ]);
    });

    it('asks for a missing title', () => {
      expect(validatePayload('project', 'create', { id: 'p2' }, context)).toEqual(
        only('title', 'Enter a title'),
      );
    });

    it('asks for a missing last day and goal', () => {
      const { expires_on: _e, goal_id: _g, ...rest } = actionBody;
      expect(validatePayload('timed_action', 'create', rest, context)).toEqual([
        { path: 'goal_id', message: 'Choose a goal' },
        { path: 'expires_on', message: 'Choose a last day' },
      ]);
    });

    it('falls back to the label and Zod message', () => {
      expect(
        validatePayload('timed_action', 'create', { ...actionBody, description: 5 }, context),
      ).toEqual(
        only('description', 'Description: Invalid input: expected string, received number'),
      );
    });
  });
});

describe('fieldLabel', () => {
  it.each([
    ['project', 'id', 'Id'],
    ['project', 'title', 'Title'],
    ['project', 'summary', 'Summary'],
    ['project', 'status', 'Status'],
    ['project', 'geo_scope', 'Geographic scope'],
    ['project', 'start_date', 'Start date'],
    ['project', 'end_date', 'End date'],
    ['goal', 'id', 'Id'],
    ['goal', 'goal', 'Goal'],
    ['goal', 'status_related_projects', 'Status'],
    ['goal', 'actions', 'Ongoing actions'],
    ['timed_action', 'goal_id', 'Goal'],
    ['timed_action', 'description', 'Description'],
    ['timed_action', 'expires_on', 'Last day'],
    ['project', 'lead_org.name', 'Lead organisation name'],
    ['project', 'lead_org.url', 'Lead organisation web address'],
    ['project', 'partners.0.name', 'Partner 1 name'],
    ['project', 'partners.2.url', 'Partner 3 web address'],
    ['project', 'milestones.0.title', 'Milestone 1 title'],
    ['project', 'milestones.0.date', 'Milestone 1 date'],
    ['project', 'sources.1.label', 'Source 2 label'],
    ['project', 'sources.1.url', 'Source 2 web address'],
    ['project', 'sources.1.last_verified', 'Source 2 last verified'],
    ['goal', 'related_orgs.0.name', 'Organisation 1 name'],
    ['goal', 'related_orgs.0.url', 'Organisation 1 web address'],
    ['goal', 'related_orgs.1.contact_info', 'Organisation 2 contact info'],
    ['timed_action', 'link.label', 'Link button label'],
    ['timed_action', 'link.url', 'Link web address'],
    ['timed_action', 'location.label', 'Location button label'],
    ['timed_action', 'location.address', 'Address'],
    ['project', 'something_else', 'something_else'],
    ['timed_action', '', ''],
  ] as const)('labels %s %s as %s', (kind, path, label) => {
    expect(fieldLabel(kind, path)).toBe(label);
  });
});

describe('fieldId', () => {
  it('builds control ids from paths', () => {
    expect(fieldId('project', 'sources.1.url')).toBe('project-sources-1-url');
    expect(fieldId('timed_action', 'link.url')).toBe('action-link-url');
  });
});
