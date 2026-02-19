export type ContentEntityType = 'project' | 'goal';
export type ContentMutationAction = 'create' | 'update' | 'archive' | 'restore';

export interface RelatedOrg {
  name: string;
  url?: string;
  contact_info?: string;
}

export interface OrganizationRef {
  name: string;
  url?: string;
}

export interface ContentSource {
  label: string;
  url: string;
  last_verified?: string;
}

export interface Provenance {
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
  license?: string;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  title: string;
  summary: string;
  lead_org?: OrganizationRef;
  partners?: OrganizationRef[];
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  milestones?: Array<Record<string, unknown>>;
  geo_scope?: string;
  modes?: string[];
  related_counties?: string[];
  sources?: ContentSource[];
  provenance?: Provenance;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  [key: string]: unknown;
}

export interface Goal {
  id: string;
  goal: string;
  status_related_projects?: string;
  actions?: string;
  related_orgs?: RelatedOrg[];
  related_project_ids?: string[];
  related_counties?: string[];
  provenance?: Provenance;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  [key: string]: unknown;
}

export interface ContentHistoryEvent {
  id: string;
  entity_type: ContentEntityType;
  entity_id: string;
  action: ContentMutationAction;
  actor: string;
  timestamp: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    count: number;
  };
}

export interface ApiItemResponse<T> {
  data: T;
}
