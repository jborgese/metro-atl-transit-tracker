// Project type definition for use in Svelte components and elsewhere
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
