// Shared org type for related organizations
export type RelatedOrg = {
  name: string;
  url?: string;
  contact_info?: string;
};

// Project type definition for infrastructure/planning projects
export type Project = {
  id: string;
  title: string;
  summary: string;
  lead_org?: { name: string; url?: string };
  partners?: { name: string; url?: string }[];
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  milestones?: any[];
  geo_scope?: string;
  modes?: string[];
  related_counties?: string[];
  sources?: any[];
  provenance?: any;
};

// Goal type definition for citizen advocacy goals
export type Goal = {
  id: string;
  goal: string;
  status_related_projects?: string;
  actions?: string;
  related_orgs?: RelatedOrg[];
  related_project_ids?: string[];  // IDs of related projects to display nested
  related_counties?: string[];
  provenance?: any;
};
