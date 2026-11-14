import type { ContentEntityType } from '#types/content.ts';

export type ContentKind = ContentEntityType;
export type ContentRecord = Record<string, unknown>;

interface Row {
  key: string;
  original: Record<string, unknown>;
}

export interface OrgRow extends Row {
  name: string;
  url: string;
}

export interface RelatedOrgRow extends OrgRow {
  contact_info: string;
}

export interface MilestoneRow extends Row {
  title: string;
  date: string;
}

export interface SourceRow extends Row {
  label: string;
  url: string;
  last_verified: string;
}

export interface ProjectDraft {
  kind: 'project';
  base: ContentRecord;
  id: string;
  title: string;
  summary: string;
  status: string;
  geo_scope: string;
  start_date: string;
  end_date: string;
  modes: string[];
  related_counties: string[];
  lead_org: { name: string; url: string; original: Record<string, unknown> };
  partners: OrgRow[];
  milestones: MilestoneRow[];
  sources: SourceRow[];
}

export interface GoalDraft {
  kind: 'goal';
  base: ContentRecord;
  id: string;
  goal: string;
  status_related_projects: string;
  actions: string;
  related_counties: string[];
  related_project_ids: string[];
  related_orgs: RelatedOrgRow[];
}

export interface TimedActionDraft {
  kind: 'timed_action';
  base: ContentRecord;
  goal_id: string;
  description: string;
  expires_on: string;
  link: { label: string; url: string };
  location: { label: string; address: string };
}

export type FormDraft = ProjectDraft | GoalDraft | TimedActionDraft;
