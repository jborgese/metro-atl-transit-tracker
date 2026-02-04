<script lang="ts">
  import type { Project } from './types';

  export let projects: Project[] = [];
  export let selectedCounty: string | null = null;

  // Group projects by lead organization name
  let grouped: Record<string, Project[]> = {};
  $: filtered = selectedCounty
    ? projects.filter((p) => p.related_counties && p.related_counties.includes(selectedCounty))
    : projects;
  $: grouped = filtered.reduce((acc: Record<string, Project[]>, p: Project) => {
    const org = p.lead_org?.name || 'Other';
    if (!acc[org]) acc[org] = [];
    acc[org].push(p);
    return acc;
  }, {});

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

<div class="projects-table">
  {#if Object.keys(grouped).length === 0}
    <p>No projects found for the selected county.</p>
  {:else}
    {#each Object.entries(grouped) as [org, orgProjects]}
      <div class="org-group">
        <h2>{org}</h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Modes</th>
            </tr>
          </thead>
          <tbody>
            {#each orgProjects as project}
              <tr>
                <td>{project.title}</td>
                <td>{statusLabel(project.status)}</td>
                <td>{project.summary}</td>
                <td>{project.modes ? project.modes.join(', ') : ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
  {/if}
</div>

<style>
.projects-table {
  margin-top: 2rem;
}
.org-group {
  margin-bottom: 2.5rem;
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
}
th {
  background: var(--surface-1);
  color: var(--text-on-dark);
}
</style>
