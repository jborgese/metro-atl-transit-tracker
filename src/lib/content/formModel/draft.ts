import type {
  ContentKind,
  ContentRecord,
  FormDraft,
  GoalDraft,
  MilestoneRow,
  OrgRow,
  ProjectDraft,
  RelatedOrgRow,
  SourceRow,
  TimedActionDraft,
} from './types';

type Plain = Record<string, unknown>;

let rowCounter = 0;

export function newRowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function emptyOrgRow(): OrgRow {
  return { key: newRowKey(), original: {}, name: '', url: '' };
}

export function emptyRelatedOrgRow(): RelatedOrgRow {
  return { ...emptyOrgRow(), contact_info: '' };
}

export function emptyMilestoneRow(): MilestoneRow {
  return { key: newRowKey(), original: {}, title: '', date: '' };
}

export function emptySourceRow(): SourceRow {
  return { key: newRowKey(), original: {}, label: '', url: '', last_verified: '' };
}

export function emptyRecord(kind: ContentKind): ContentRecord {
  if (kind === 'project') {
    return {
      id: '',
      title: '',
      summary: '',
      status: 'planning',
      modes: [],
      related_counties: [],
      sources: [],
    };
  }
  if (kind === 'goal') {
    return {
      id: '',
      goal: '',
      actions: '',
      related_project_ids: [],
      related_counties: [],
      related_orgs: [],
    };
  }
  return { goal_id: '', description: '', link: null, location: null, expires_on: '' };
}

export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && sameValue([...a].sort(), [...b].sort());
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function plain(value: unknown): Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Plain)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function items(value: unknown): Plain[] {
  return Array.isArray(value) ? value.map(plain) : [];
}

function isBlank(value: string): boolean {
  return value.trim() === '';
}

function writeText(out: Plain, base: Plain, key: string, value: string): void {
  if (key in base || !isBlank(value)) out[key] = value;
}

function writeNonBlank(out: Plain, key: string, value: string): void {
  if (!isBlank(value)) out[key] = value;
}

function writeDate(out: Plain, base: Plain, key: string, value: string): void {
  if (!isBlank(value)) out[key] = value;
  else if (key in base) out[key] = null;
}

function writeList(out: Plain, base: Plain, key: string, value: unknown[]): void {
  if (key in base || value.length > 0) out[key] = [...value];
}

function buildRow(
  original: Plain,
  current: Record<string, string>,
  derived: Record<string, string>,
  optional: string[],
): Plain | null {
  if (Object.values(current).every(isBlank) && Object.keys(original).length === 0) return null;
  const row: Plain = copy(original);
  for (const [name, value] of Object.entries(current)) {
    if (value === derived[name]) continue;
    if (optional.includes(name) && isBlank(value)) delete row[name];
    else row[name] = value;
  }
  return row;
}

function rowSignature(row: object): string {
  return JSON.stringify(Object.entries(row).filter(([name]) => name !== 'key'));
}

function sameRows(rows: object[], pristine: object[]): boolean {
  return (
    rows.length === pristine.length &&
    rows.every((row, i) => rowSignature(row) === rowSignature(pristine[i] ?? {}))
  );
}

function writeRows<T extends object>(
  out: Plain,
  base: Plain,
  key: string,
  rows: T[],
  pristine: T[],
  build: (row: T) => Plain | null,
): void {
  if (sameRows(rows, pristine)) return;
  const built = rows.map(build).filter((row): row is Plain => row !== null);
  if (built.length === 0 && !Array.isArray(base[key])) return;
  out[key] = built;
}

function orgRow(original: Plain): OrgRow {
  return { key: newRowKey(), original, name: str(original.name), url: str(original.url) };
}

function relatedOrgRow(original: Plain): RelatedOrgRow {
  return { ...orgRow(original), contact_info: str(original.contact_info) };
}

function milestoneRow(original: Plain): MilestoneRow {
  return { key: newRowKey(), original, title: str(original.title), date: str(original.date) };
}

function sourceRow(original: Plain): SourceRow {
  return {
    key: newRowKey(),
    original,
    label: str(original.label),
    url: str(original.url),
    last_verified: str(original.last_verified),
  };
}

function orgRecord(row: OrgRow): Plain | null {
  const fields = (r: OrgRow) => ({ name: r.name, url: r.url });
  return buildRow(row.original, fields(row), fields(orgRow(row.original)), ['url']);
}

function relatedOrgRecord(row: RelatedOrgRow): Plain | null {
  const fields = (r: RelatedOrgRow) => ({
    name: r.name,
    url: r.url,
    contact_info: r.contact_info,
  });
  return buildRow(row.original, fields(row), fields(relatedOrgRow(row.original)), [
    'url',
    'contact_info',
  ]);
}

function milestoneRecord(row: MilestoneRow): Plain | null {
  const fields = (r: MilestoneRow) => ({ title: r.title, date: r.date });
  return buildRow(row.original, fields(row), fields(milestoneRow(row.original)), []);
}

function sourceRecord(row: SourceRow): Plain | null {
  const fields = (r: SourceRow) => ({
    label: r.label,
    url: r.url,
    last_verified: r.last_verified,
  });
  return buildRow(row.original, fields(row), fields(sourceRow(row.original)), [
    'url',
    'last_verified',
  ]);
}

function projectDraft(base: Plain): ProjectDraft {
  const lead = plain(base.lead_org);
  return {
    kind: 'project',
    base,
    id: str(base.id),
    title: str(base.title),
    summary: str(base.summary),
    status: str(base.status),
    geo_scope: str(base.geo_scope),
    start_date: str(base.start_date),
    end_date: str(base.end_date),
    modes: strings(base.modes),
    related_counties: strings(base.related_counties),
    lead_org: { name: str(lead.name), url: str(lead.url), original: lead },
    partners: items(base.partners).map(orgRow),
    milestones: items(base.milestones).map(milestoneRow),
    sources: items(base.sources).map(sourceRow),
  };
}

function goalDraft(base: Plain): GoalDraft {
  return {
    kind: 'goal',
    base,
    id: str(base.id),
    goal: str(base.goal),
    status_related_projects: str(base.status_related_projects),
    actions: str(base.actions),
    related_counties: strings(base.related_counties),
    related_project_ids: strings(base.related_project_ids),
    related_orgs: items(base.related_orgs).map(relatedOrgRow),
  };
}

function timedActionDraft(base: Plain): TimedActionDraft {
  const link = plain(base.link);
  const location = plain(base.location);
  return {
    kind: 'timed_action',
    base,
    goal_id: str(base.goal_id),
    description: str(base.description),
    expires_on: str(base.expires_on),
    link: { label: str(link.label), url: str(link.url) },
    location: { label: str(location.label), address: str(location.address) },
  };
}

export function toFormDraft(kind: ContentKind, record: ContentRecord): FormDraft {
  const base = copy(record);
  if (kind === 'project') return projectDraft(base);
  if (kind === 'goal') return goalDraft(base);
  return timedActionDraft(base);
}

function writeLeadOrg(out: Plain, draft: ProjectDraft, pristine: ProjectDraft): void {
  const { name, url, original } = draft.lead_org;
  const was = pristine.lead_org;
  if (name === was.name && url === was.url) return;
  const lead: Plain = copy(original);
  if (name !== was.name) lead.name = name;
  if (url !== was.url) {
    if (isBlank(url)) delete lead.url;
    else lead.url = url;
  }
  out.lead_org = lead;
}

function projectRecord(d: ProjectDraft): ContentRecord {
  const p = projectDraft(d.base);
  const out: Plain = { ...d.base };
  if (d.id !== p.id) writeText(out, d.base, 'id', d.id);
  if (d.title !== p.title) writeText(out, d.base, 'title', d.title);
  if (d.summary !== p.summary) writeText(out, d.base, 'summary', d.summary);
  if (d.status !== p.status) writeNonBlank(out, 'status', d.status);
  if (d.geo_scope !== p.geo_scope) writeNonBlank(out, 'geo_scope', d.geo_scope);
  if (d.start_date !== p.start_date) writeDate(out, d.base, 'start_date', d.start_date);
  if (d.end_date !== p.end_date) writeDate(out, d.base, 'end_date', d.end_date);
  if (!sameMembers(d.modes, p.modes)) writeList(out, d.base, 'modes', d.modes);
  if (!sameMembers(d.related_counties, p.related_counties)) {
    writeList(out, d.base, 'related_counties', d.related_counties);
  }
  writeLeadOrg(out, d, p);
  writeRows(out, d.base, 'partners', d.partners, p.partners, orgRecord);
  writeRows(out, d.base, 'milestones', d.milestones, p.milestones, milestoneRecord);
  writeRows(out, d.base, 'sources', d.sources, p.sources, sourceRecord);
  return out;
}

function goalRecord(d: GoalDraft): ContentRecord {
  const p = goalDraft(d.base);
  const out: Plain = { ...d.base };
  if (d.id !== p.id) writeText(out, d.base, 'id', d.id);
  if (d.goal !== p.goal) writeText(out, d.base, 'goal', d.goal);
  if (d.status_related_projects !== p.status_related_projects) {
    writeText(out, d.base, 'status_related_projects', d.status_related_projects);
  }
  if (d.actions !== p.actions) writeText(out, d.base, 'actions', d.actions);
  if (!sameMembers(d.related_counties, p.related_counties)) {
    writeList(out, d.base, 'related_counties', d.related_counties);
  }
  if (!sameMembers(d.related_project_ids, p.related_project_ids)) {
    writeList(out, d.base, 'related_project_ids', d.related_project_ids);
  }
  writeRows(out, d.base, 'related_orgs', d.related_orgs, p.related_orgs, relatedOrgRecord);
  return out;
}

function writePair(
  out: Plain,
  base: Plain,
  key: string,
  pair: Record<string, string>,
  pristine: Record<string, string>,
): void {
  if (sameValue(pair, pristine)) return;
  if (!Object.values(pair).every(isBlank)) out[key] = { ...pair };
  else if (key in base) out[key] = null;
}

function timedActionRecord(d: TimedActionDraft): ContentRecord {
  const p = timedActionDraft(d.base);
  const out: Plain = { ...d.base };
  if (d.goal_id !== p.goal_id) writeText(out, d.base, 'goal_id', d.goal_id);
  if (d.description !== p.description) writeText(out, d.base, 'description', d.description);
  writePair(out, d.base, 'link', d.link, p.link);
  writePair(out, d.base, 'location', d.location, p.location);
  if (d.expires_on !== p.expires_on) writeText(out, d.base, 'expires_on', d.expires_on);
  return out;
}

export type FieldType = 'text' | 'text or null' | 'list' | 'object' | 'object or null';

export const KNOWN_FIELDS: Record<ContentKind, Record<string, FieldType>> = {
  project: {
    id: 'text',
    title: 'text',
    summary: 'text',
    status: 'text',
    geo_scope: 'text',
    start_date: 'text or null',
    end_date: 'text or null',
    modes: 'list',
    related_counties: 'list',
    lead_org: 'object',
    partners: 'list',
    milestones: 'list',
    sources: 'list',
  },
  goal: {
    id: 'text',
    goal: 'text',
    status_related_projects: 'text',
    actions: 'text',
    related_counties: 'list',
    related_project_ids: 'list',
    related_orgs: 'list',
  },
  timed_action: {
    goal_id: 'text',
    description: 'text',
    expires_on: 'text',
    link: 'object or null',
    location: 'object or null',
  },
};

function isDroppable(row: object & { original: Plain }): boolean {
  return (
    Object.keys(row.original).length === 0 &&
    Object.entries(row).every(
      ([name, value]) =>
        name === 'key' || name === 'original' || (typeof value === 'string' && isBlank(value)),
    )
  );
}

function prunedRows<R extends object & { original: Plain }>(rows: R[], pristine: R[]): R[] {
  return sameRows(rows, pristine) ? rows : rows.filter((row) => !isDroppable(row));
}

function pruneDraft(d: FormDraft): FormDraft {
  if (d.kind === 'project') {
    const p = projectDraft(d.base);
    return {
      ...d,
      partners: prunedRows(d.partners, p.partners),
      milestones: prunedRows(d.milestones, p.milestones),
      sources: prunedRows(d.sources, p.sources),
    };
  }
  if (d.kind === 'goal') {
    return { ...d, related_orgs: prunedRows(d.related_orgs, goalDraft(d.base).related_orgs) };
  }
  return d;
}

export function pruneBlankRows<T extends FormDraft>(draft: T): T {
  return pruneDraft(copy(draft)) as T;
}

export function toRecord(draft: FormDraft): ContentRecord {
  const d = copy(draft);
  if (d.kind === 'project') return projectRecord(d);
  if (d.kind === 'goal') return goalRecord(d);
  return timedActionRecord(d);
}
