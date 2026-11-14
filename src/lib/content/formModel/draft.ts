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
  required: Record<string, string>,
  optional: Record<string, string>,
): Plain | null {
  const all = [...Object.values(required), ...Object.values(optional)];
  if (all.every(isBlank) && Object.keys(original).length === 0) return null;
  const row: Plain = { ...original, ...required };
  for (const [name, value] of Object.entries(optional)) {
    if (!isBlank(value)) row[name] = value;
    else if (original[name] === '') row[name] = '';
    else delete row[name];
  }
  return row;
}

function buildRows<T>(rows: T[], build: (row: T) => Plain | null): Plain[] {
  return rows.map(build).filter((row): row is Plain => row !== null);
}

function orgRows(value: unknown): OrgRow[] {
  return items(value).map((original) => ({
    key: newRowKey(),
    original,
    name: str(original.name),
    url: str(original.url),
  }));
}

function relatedOrgRows(value: unknown): RelatedOrgRow[] {
  return items(value).map((original) => ({
    key: newRowKey(),
    original,
    name: str(original.name),
    url: str(original.url),
    contact_info: str(original.contact_info),
  }));
}

function milestoneRows(value: unknown): MilestoneRow[] {
  return items(value).map((original) => ({
    key: newRowKey(),
    original,
    title: str(original.title),
    date: str(original.date),
  }));
}

function sourceRows(value: unknown): SourceRow[] {
  return items(value).map((original) => ({
    key: newRowKey(),
    original,
    label: str(original.label),
    url: str(original.url),
    last_verified: str(original.last_verified),
  }));
}

function orgRecord(row: OrgRow): Plain | null {
  return buildRow(row.original, { name: row.name }, { url: row.url });
}

function relatedOrgRecord(row: RelatedOrgRow): Plain | null {
  return buildRow(
    row.original,
    { name: row.name },
    { url: row.url, contact_info: row.contact_info },
  );
}

function milestoneRecord(row: MilestoneRow): Plain | null {
  return buildRow(row.original, { title: row.title, date: row.date }, {});
}

function sourceRecord(row: SourceRow): Plain | null {
  return buildRow(
    row.original,
    { label: row.label },
    { url: row.url, last_verified: row.last_verified },
  );
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
    partners: orgRows(base.partners),
    milestones: milestoneRows(base.milestones),
    sources: sourceRows(base.sources),
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
    related_orgs: relatedOrgRows(base.related_orgs),
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
  const base = structuredClone(record);
  if (kind === 'project') return projectDraft(base);
  if (kind === 'goal') return goalDraft(base);
  return timedActionDraft(base);
}

function writeLeadOrg(out: Plain, draft: ProjectDraft): void {
  const { name, url, original } = draft.lead_org;
  if (!('lead_org' in draft.base) && isBlank(name) && isBlank(url)) return;
  const lead: Plain = { ...original, name };
  if (!isBlank(url)) lead.url = url;
  else delete lead.url;
  out.lead_org = lead;
}

function projectRecord(draft: ProjectDraft): ContentRecord {
  const { base } = draft;
  const out: Plain = { ...base };
  writeText(out, base, 'id', draft.id);
  writeText(out, base, 'title', draft.title);
  writeText(out, base, 'summary', draft.summary);
  writeNonBlank(out, 'status', draft.status);
  writeNonBlank(out, 'geo_scope', draft.geo_scope);
  writeDate(out, base, 'start_date', draft.start_date);
  writeDate(out, base, 'end_date', draft.end_date);
  writeList(out, base, 'modes', draft.modes);
  writeList(out, base, 'related_counties', draft.related_counties);
  writeLeadOrg(out, draft);
  writeList(out, base, 'partners', buildRows(draft.partners, orgRecord));
  writeList(out, base, 'milestones', buildRows(draft.milestones, milestoneRecord));
  writeList(out, base, 'sources', buildRows(draft.sources, sourceRecord));
  return out;
}

function goalRecord(draft: GoalDraft): ContentRecord {
  const { base } = draft;
  const out: Plain = { ...base };
  writeText(out, base, 'id', draft.id);
  writeText(out, base, 'goal', draft.goal);
  writeText(out, base, 'status_related_projects', draft.status_related_projects);
  writeText(out, base, 'actions', draft.actions);
  writeList(out, base, 'related_counties', draft.related_counties);
  writeList(out, base, 'related_project_ids', draft.related_project_ids);
  writeList(out, base, 'related_orgs', buildRows(draft.related_orgs, relatedOrgRecord));
  return out;
}

function writePair(out: Plain, base: Plain, key: string, pair: Record<string, string>): void {
  if (!Object.values(pair).every(isBlank)) out[key] = { ...pair };
  else if (key in base) out[key] = null;
}

function timedActionRecord(draft: TimedActionDraft): ContentRecord {
  const { base } = draft;
  const out: Plain = { ...base };
  writeText(out, base, 'goal_id', draft.goal_id);
  writeText(out, base, 'description', draft.description);
  writePair(out, base, 'link', draft.link);
  writePair(out, base, 'location', draft.location);
  writeText(out, base, 'expires_on', draft.expires_on);
  return out;
}

export function toRecord(draft: FormDraft): ContentRecord {
  if (draft.kind === 'project') return projectRecord(draft);
  if (draft.kind === 'goal') return goalRecord(draft);
  return timedActionRecord(draft);
}
