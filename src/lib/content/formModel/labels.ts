import type { ContentKind } from './types';

const TOP_LEVEL: Record<ContentKind, Record<string, string>> = {
  project: {
    id: 'Id',
    title: 'Title',
    summary: 'Summary',
    status: 'Status',
    geo_scope: 'Geographic scope',
    start_date: 'Start date',
    end_date: 'End date',
  },
  goal: {
    id: 'Id',
    goal: 'Goal',
    status_related_projects: 'Status',
    actions: 'Ongoing actions',
  },
  timed_action: {
    goal_id: 'Goal',
    description: 'Description',
    expires_on: 'Last day',
  },
};

const FIXED: Record<string, string> = {
  'lead_org.name': 'Lead organisation name',
  'lead_org.url': 'Lead organisation web address',
  'link.label': 'Link button label',
  'link.url': 'Link web address',
  'location.label': 'Location button label',
  'location.address': 'Address',
};

const ROWS: Record<string, { noun: string; fields: Record<string, string> }> = {
  partners: { noun: 'Partner', fields: { name: 'name', url: 'web address' } },
  milestones: { noun: 'Milestone', fields: { title: 'title', date: 'date' } },
  sources: {
    noun: 'Source',
    fields: { label: 'label', url: 'web address', last_verified: 'last verified' },
  },
  related_orgs: {
    noun: 'Organisation',
    fields: { name: 'name', url: 'web address', contact_info: 'contact info' },
  },
};

function rowLabel(path: string): string | undefined {
  const [group, index, field] = path.split('.');
  const row = group === undefined ? undefined : ROWS[group];
  const word = field === undefined ? undefined : row?.fields[field];
  const position = Number(index);
  if (row === undefined || word === undefined || !Number.isInteger(position)) {
    return undefined;
  }
  return `${row.noun} ${position + 1} ${word}`;
}

export function fieldLabel(kind: ContentKind, path: string): string {
  return TOP_LEVEL[kind][path] ?? FIXED[path] ?? rowLabel(path) ?? path;
}

export function fieldId(kind: ContentKind, path: string): string {
  const prefix = kind === 'timed_action' ? 'action' : kind;
  return `${prefix}-${path.replaceAll('.', '-')}`;
}
