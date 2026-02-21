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
        <div class="table-scroll">
          <table class="data-table projects-data-table">
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
                <tr class="project-row">
                  <td data-label="Project">{project.title}</td>
                  <td data-label="Status">{statusLabel(project.status)}</td>
                  <td data-label="Summary">{project.summary}</td>
                  <td data-label="Modes">{project.modes ? project.modes.join(', ') : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
.projects-table {
  margin-top: 2rem;
  container-type: inline-size;
  container-name: projects-layout;
}
.org-group {
  margin-bottom: 2.5rem;
}

@container projects-layout (max-width: 42rem) {
  .table-scroll {
    overflow-x: visible;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .projects-data-table {
    width: 100%;
    min-width: 0;
    border-collapse: separate;
    border-spacing: 0;
  }

  .projects-data-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .projects-data-table,
  .projects-data-table tbody,
  .projects-data-table .project-row,
  .projects-data-table .project-row td {
    display: block;
    width: 100%;
  }

  .projects-data-table tbody {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .projects-data-table .project-row {
    border: 1px solid var(--border-subtle, #334155);
    border-radius: 10px;
    overflow: hidden;
    background: color-mix(in srgb, var(--surface-2, #10201e) 94%, black);
  }

  .projects-data-table .project-row td {
    border: 0;
    border-bottom: 1px solid var(--border-subtle, #334155);
    padding: 0.625rem 0.75rem;
    display: grid;
    grid-template-columns: minmax(7rem, 40%) 1fr;
    gap: 0.5rem;
    align-items: start;
    font-size: 0.92rem;
  }

  .projects-data-table .project-row td:last-child {
    border-bottom: 0;
  }

  .projects-data-table .project-row td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    line-height: 1.35;
  }
}

@container projects-layout (max-width: 30rem) {
  .projects-data-table .project-row td {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
}
</style>
