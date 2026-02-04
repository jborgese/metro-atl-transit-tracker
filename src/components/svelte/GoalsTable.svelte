<script lang="ts">
  import type { Goal, Project } from './types';

  export let goals: Goal[] = [];
  export let projects: Project[] = [];
  export let selectedCounty: string | null = null;
  export let countyNames: Record<string, string> = {};

  // County name lookup (FIPS to name) - ordered for display
  const defaultCountyNames: Record<string, string> = {
    '13121': 'Fulton County',
    '13089': 'DeKalb County',
    '13067': 'Cobb County',
    '13135': 'Gwinnett County',
    '13063': 'Clayton County',
    '13151': 'Henry County'
  };

  // Ordered list of county IDs for consistent display
  const countyOrder = ['13121', '13089', '13067', '13135', '13063', '13151'];

  $: countyLookup = { ...defaultCountyNames, ...countyNames };

  // Filter goals by selected county
  $: filtered = selectedCounty
    ? goals.filter((g) => g.related_counties && g.related_counties.includes(selectedCounty))
    : goals;

  // Group goals by county (only used when no county is selected)
  // Includes all counties, even those without goals
  $: groupedByCounty = !selectedCounty ? groupGoalsByCounty(goals) : null;

  function groupGoalsByCounty(goalsList: Goal[]): Map<string, Goal[]> {
    const grouped = new Map<string, Goal[]>();
    
    // Initialize all counties with empty arrays (in order)
    for (const countyId of countyOrder) {
      grouped.set(countyId, []);
    }
    
    // Populate with goals
    for (const goal of goalsList) {
      // Add goal to each county it's related to
      if (goal.related_counties) {
        for (const countyId of goal.related_counties) {
          if (grouped.has(countyId)) {
            grouped.get(countyId)!.push(goal);
          }
        }
      }
    }
    
    return grouped;
  }

  function getCountyName(geoid: string): string {
    return countyLookup[geoid] || `County ${geoid}`;
  }

  // Get related projects for a goal
  function getRelatedProjects(goal: Goal): Project[] {
    if (!goal.related_project_ids || goal.related_project_ids.length === 0) return [];
    return projects.filter((p) => goal.related_project_ids!.includes(p.id));
  }

  // Helper for status display
  function statusLabel(status: string) {
    switch (status) {
      case 'planning': return 'Planning';
      case 'public-outreach': return 'Public Outreach';
      case 'funding-application': return 'Funding Application';
      case 'implementation': return 'Implementation';
      case 'completed': return 'Completed';
      case 'ongoing': return 'Ongoing';
      default: return status;
    }
  }
</script>

<div class="goals-table">
  {#if selectedCounty && filtered.length === 0}
    <p>No goals found for the selected county.</p>
  {:else if groupedByCounty}
    <!-- No county selected: show grouped by county -->
    {#each [...groupedByCounty.entries()] as [countyId, countyGoals]}
      <div class="county-section">
        <h2 class="county-header">{getCountyName(countyId)}</h2>
        {#if countyGoals.length === 0}
          <p class="no-goals-message">No goal information is available for this county.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Status/Related Projects</th>
                <th>Actions to take in support of the Goal</th>
                <th>Related Orgs</th>
              </tr>
            </thead>
            <tbody>
              {#each countyGoals as goal}
                <tr class="goal-row">
                  <td>{goal.goal}</td>
                <td>
                  {#if goal.status_related_projects}
                    {goal.status_related_projects}
                  {/if}
                </td>
                <td>{goal.actions || ''}</td>
                <td>
                  {#if goal.related_orgs && goal.related_orgs.length > 0}
                    {#each goal.related_orgs as org}
                      <div class="related-org">
                        {#if org.url}
                          <a href={org.url} target="_blank" rel="noopener noreferrer">{org.name}</a>
                        {:else}
                          <span>{org.name}</span>
                        {/if}
                        {#if org.contact_info}
                          <span class="contact-info">({org.contact_info})</span>
                        {/if}
                      </div>
                    {/each}
                  {/if}
                </td>
              </tr>
              <!-- Nested project rows -->
              {#each getRelatedProjects(goal) as project}
                <tr class="project-row">
                  <td class="nested-cell" colspan="4">
                    <div class="project-card">
                      <div class="project-header">
                        <span class="project-indicator">↳</span>
                        <a href={project.sources?.[0]?.url || '#'} target="_blank" rel="noopener noreferrer" class="project-title">
                          {project.title}
                        </a>
                        <span class="project-status">{statusLabel(project.status)}</span>
                      </div>
                      <p class="project-summary">{project.summary}</p>
                      {#if project.lead_org}
                        <div class="project-org">
                          <span class="org-label">Lead:</span>
                          {#if project.lead_org.url}
                            <a href={project.lead_org.url} target="_blank" rel="noopener noreferrer">{project.lead_org.name}</a>
                          {:else}
                            <span>{project.lead_org.name}</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
        {/if}
      </div>
    {/each}
  {:else}
    <!-- County selected: show single table with header -->
    <div class="county-section">
      <h2 class="county-header">{getCountyName(selectedCounty)}</h2>
      <table>
        <thead>
          <tr>
            <th>Goal</th>
            <th>Status/Related Projects</th>
            <th>Actions to take in support of the Goal</th>
            <th>Related Orgs</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as goal}
            <tr class="goal-row">
              <td>{goal.goal}</td>
              <td>
                {#if goal.status_related_projects}
                  {goal.status_related_projects}
                {/if}
              </td>
              <td>{goal.actions || ''}</td>
              <td>
                {#if goal.related_orgs && goal.related_orgs.length > 0}
                  {#each goal.related_orgs as org}
                    <div class="related-org">
                      {#if org.url}
                        <a href={org.url} target="_blank" rel="noopener noreferrer">{org.name}</a>
                      {:else}
                        <span>{org.name}</span>
                      {/if}
                      {#if org.contact_info}
                        <span class="contact-info">({org.contact_info})</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </td>
            </tr>
            <!-- Nested project rows -->
            {#each getRelatedProjects(goal) as project}
              <tr class="project-row">
                <td class="nested-cell" colspan="4">
                  <div class="project-card">
                    <div class="project-header">
                      <span class="project-indicator">↳</span>
                      <a href={project.sources?.[0]?.url || '#'} target="_blank" rel="noopener noreferrer" class="project-title">
                        {project.title}
                      </a>
                      <span class="project-status">{statusLabel(project.status)}</span>
                    </div>
                    <p class="project-summary">{project.summary}</p>
                    {#if project.lead_org}
                      <div class="project-org">
                        <span class="org-label">Lead:</span>
                        {#if project.lead_org.url}
                          <a href={project.lead_org.url} target="_blank" rel="noopener noreferrer">{project.lead_org.name}</a>
                        {:else}
                          <span>{project.lead_org.name}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
.goals-table {
  margin-top: 2rem;
}
.county-section {
  margin-bottom: 2.5rem;
}
.county-header {
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent-color, #3b82f6);
}
.no-goals-message {
  color: var(--text-muted, #94a3b8);
  font-style: italic;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px dashed var(--border-subtle, #334155);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}
th, td {
  border: 1px solid var(--border-subtle);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
th {
  background: var(--surface-1);
  color: var(--text-on-dark);
}
td a {
  color: var(--link-color, #0066cc);
  text-decoration: none;
}
td a:hover {
  text-decoration: underline;
}
.goal-row {
  background: var(--surface-0, #fff);
}
.goal-row td:first-child {
  font-weight: 600;
}
.project-row {
  background: transparent;
}
.project-row td {
  border-top: none;
  padding: 0;
}
.nested-cell {
  padding-left: 1.5rem !important;
  padding-right: 0.75rem !important;
  padding-bottom: 0.75rem !important;
}
.project-card {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-left: 3px solid var(--link-color, #3b82f6);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-left: 1rem;
}
.project-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.project-indicator {
  color: var(--link-color, #3b82f6);
  font-weight: bold;
  font-size: 1.1em;
}
.project-title {
  font-weight: 600;
  color: var(--link-color, #0066cc);
}
.project-status {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75em;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.project-summary {
  font-size: 0.9em;
  color: var(--text-secondary, #cbd5e1);
  margin: 0 0 0.5rem 0;
  line-height: 1.4;
}
.project-org {
  font-size: 0.85em;
}
.org-label {
  color: var(--text-muted, #64748b);
  margin-right: 0.25rem;
}
.related-org {
  margin-bottom: 0.5rem;
}
.related-org:last-child {
  margin-bottom: 0;
}
.contact-info {
  display: block;
  font-size: 0.85em;
  color: var(--text-muted, #666);
}
</style>
