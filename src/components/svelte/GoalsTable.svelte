<script lang="ts">
  import type { Goal, Project } from './types';

  export let goals: Goal[] = [];
  export let projects: Project[] = [];
  export let selectedCounty: string | null = null;

  // Filter goals by selected county
  $: filtered = selectedCounty
    ? goals.filter((g) => g.related_counties && g.related_counties.includes(selectedCounty))
    : goals;

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
  {#if filtered.length === 0}
    <p>No goals found for the selected county.</p>
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
              <td class="nested-cell">
                <span class="project-indicator">└</span>
                <a href={project.sources?.[0]?.url || '#'} target="_blank" rel="noopener noreferrer">
                  {project.title}
                </a>
              </td>
              <td>{statusLabel(project.status)}</td>
              <td>{project.summary}</td>
              <td>
                {#if project.lead_org}
                  <div class="related-org">
                    {#if project.lead_org.url}
                      <a href={project.lead_org.url} target="_blank" rel="noopener noreferrer">{project.lead_org.name}</a>
                    {:else}
                      <span>{project.lead_org.name}</span>
                    {/if}
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
.goals-table {
  margin-top: 2rem;
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
  background: var(--surface-nested, #f8f9fa);
}
.project-row td {
  font-size: 0.9em;
  border-top: none;
}
.nested-cell {
  padding-left: 1.5rem;
}
.project-indicator {
  color: var(--text-muted, #666);
  margin-right: 0.5rem;
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
