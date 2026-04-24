<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Goal, Project } from './types';
  import { statusLabel, getStatusColor } from '@/utils/statusHelpers';
  import { countyOrder, getCountyName as lookupCountyName } from '@/utils/countyLookup';

  export let goals: Goal[] = [];
  export let projects: Project[] = [];
  export let selectedCounty: string | null = null;
  export let countyNames: Record<string, string> = {};

  const dispatch = createEventDispatcher<{
    clearCounty: void;
    selectProject: { project: Project };
  }>();

  function getCountyName(geoid: string): string {
    return lookupCountyName(geoid, countyNames);
  }

  function shortCountyName(geoid: string): string {
    return getCountyName(geoid).replace(/ County$/, '');
  }

  function selectProject(project: Project) {
    dispatch('selectProject', { project });
  }

  function handleProjectCardClick(project: Project, event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('a')) return;
    selectProject(project);
  }

  function handleProjectCardKeydown(project: Project, event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('a')) return;
    event.preventDefault();
    selectProject(project);
  }

  // Determine if a goal is "Regional" (has no specific county - empty related_counties)
  function isRegionalGoal(goal: Goal): boolean {
    return !goal.related_counties || goal.related_counties.length === 0;
  }

  // Get regional goals (goals with no specific county)
  $: regionalGoals = goals.filter(isRegionalGoal);

  // Filter goals by selected county (excludes regional goals to avoid duplication)
  $: filtered = selectedCounty
    ? goals.filter((g) => g.related_counties && g.related_counties.includes(selectedCounty) && !isRegionalGoal(g))
    : goals;

  // Group goals by county (only used when no county is selected)
  // Includes all counties, even those without goals
  // Excludes regional goals (they're shown separately)
  $: groupedByCounty = !selectedCounty ? groupGoalsByCounty(goals) : null;

  function groupGoalsByCounty(goalsList: Goal[]): Map<string, Goal[]> {
    const grouped = new Map<string, Goal[]>();
    
    // Initialize all counties with empty arrays (in order)
    for (const countyId of countyOrder) {
      grouped.set(countyId, []);
    }
    
    // Populate with goals (only non-regional goals)
    for (const goal of goalsList) {
      // Skip regional goals - they're displayed separately
      if (isRegionalGoal(goal)) continue;
      
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

  function getRelatedProjects(goal: Goal): Project[] {
    if (!goal.related_project_ids || goal.related_project_ids.length === 0) return [];
    return projects.filter((p) => goal.related_project_ids!.includes(p.id));
  }

  type StatusContentPart =
    | { type: 'text'; value: string }
    | { type: 'url'; href: string; label: string };

  function buildLinkLabel(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const pathSegments = parsed.pathname.split('/').filter(Boolean);

      if (pathSegments.length === 0) return host;
      if (pathSegments.length === 1) return `${host}/${pathSegments[0]}`;

      return `${host}/${pathSegments[0]}/...`;
    } catch {
      return url;
    }
  }

  function parseStatusContent(input?: string): StatusContentPart[] {
    if (!input) return [];

    const urlRegex = /https?:\/\/[^\s]+/g;
    const trailingPunctuationRegex = /[),.;!?]+$/;
    const parts: StatusContentPart[] = [];
    let lastIndex = 0;

    for (const match of input.matchAll(urlRegex)) {
      const rawUrl = match[0];
      const start = match.index ?? 0;

      if (start > lastIndex) {
        parts.push({ type: 'text', value: input.slice(lastIndex, start) });
      }

      const trailingMatch = rawUrl.match(trailingPunctuationRegex);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const cleanUrl = trailing ? rawUrl.slice(0, rawUrl.length - trailing.length) : rawUrl;

      parts.push({
        type: 'url',
        href: cleanUrl,
        label: buildLinkLabel(cleanUrl)
      });

      if (trailing) {
        parts.push({ type: 'text', value: trailing });
      }

      lastIndex = start + rawUrl.length;
    }

    if (lastIndex < input.length) {
      parts.push({ type: 'text', value: input.slice(lastIndex) });
    }

    return parts;
  }
</script>

<div class="goals-table">
  <div class="goals-nav">
    <nav class="county-jump" aria-label="Jump to section">
      <a href="#section-regional">Regional</a>
      {#each countyOrder as countyId}
        <a href="#section-{countyId}">{shortCountyName(countyId)}</a>
      {/each}
    </nav>
    {#if selectedCounty}
      <button
        type="button"
        class="clear-filter"
        on:click={() => dispatch('clearCounty')}
      >
        Show all counties
      </button>
    {/if}
  </div>

  {#if groupedByCounty}
    <!-- No county selected: show Regional first, then grouped by county -->

    <!-- Regional Section (at top when no county selected) -->
    <div class="county-section" id="section-regional">
      <h2 class="county-header">
        Regional
        {#if regionalGoals.length > 0}
          <span class="goal-count">({regionalGoals.length})</span>
        {/if}
      </h2>
      {#if regionalGoals.length === 0}
        <p class="no-goals-message">No regional goal information is available.</p>
      {:else}
        <div class="table-scroll">
          <table class="data-table goals-data-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Orgs</th>
            </tr>
          </thead>
          <tbody>
            {#each regionalGoals as goal}
              <tr class="goal-row">
                <td data-label="Goal">{goal.goal}</td>
              <td data-label="Status">
                {#if goal.status_related_projects}
                  {#each parseStatusContent(goal.status_related_projects) as part}
                    {#if part.type === 'url'}
                      <a href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>
                    {:else}
                      {part.value}
                    {/if}
                  {/each}
                {/if}
              </td>
              <td data-label="Actions">{goal.actions || ''}</td>
              <td data-label="Orgs">
                {#if goal.related_orgs && goal.related_orgs.length > 0}
                  {#each goal.related_orgs as org}
                    <div class="related-org">
                      {#if org.url}
                        <a href={org.url} target="_blank" rel="noopener noreferrer">{org.name}</a>
                      {:else}
                        <span>{org.name}</span>
                      {/if}
                      {#if org.contact_info}
                        <span class="contact-info">{org.contact_info}</span>
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
                  <div
                    class="project-card"
                    role="button"
                    tabindex="0"
                    aria-label="View details for {project.title}"
                    style="--status-color: {getStatusColor(project.status)}"
                    on:click={(e) => handleProjectCardClick(project, e)}
                    on:keydown={(e) => handleProjectCardKeydown(project, e)}
                  >
                    <div class="project-header">
                      <span class="project-indicator" aria-hidden="true">&rarr;</span>
                      <span class="project-title">{project.title}</span>
                      <span class="project-status" style="background: {getStatusColor(project.status)}">{statusLabel(project.status)}</span>
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
                    <div class="project-card-footer">
                      <span class="project-card-hint">View details</span>
                      {#if project.sources?.[0]?.url}
                        <a
                          class="project-source-link"
                          href={project.sources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >View source →</a>
                      {/if}
                    </div>
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
    
    <!-- County Sections -->
    {#each [...groupedByCounty.entries()] as [countyId, countyGoals]}
      <div class="county-section" id="section-{countyId}">
        <h2 class="county-header">
          {getCountyName(countyId)}
          {#if countyGoals.length > 0}
            <span class="goal-count">({countyGoals.length})</span>
          {/if}
        </h2>
        {#if countyGoals.length === 0}
          <p class="no-goals-message">No goal information is available for this county.</p>
        {:else}
          <div class="table-scroll">
            <table class="data-table goals-data-table">
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
                  <td data-label="Goal">{goal.goal}</td>
                <td data-label="Status">
                  {#if goal.status_related_projects}
                    {#each parseStatusContent(goal.status_related_projects) as part}
                      {#if part.type === 'url'}
                        <a href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>
                      {:else}
                        {part.value}
                      {/if}
                    {/each}
                  {/if}
                </td>
                <td data-label="Actions">{goal.actions || ''}</td>
                <td data-label="Orgs">
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
                    <div
                      class="project-card"
                      role="button"
                      tabindex="0"
                      aria-label="View details for {project.title}"
                      style="--status-color: {getStatusColor(project.status)}"
                      on:click={(e) => handleProjectCardClick(project, e)}
                      on:keydown={(e) => handleProjectCardKeydown(project, e)}
                    >
                      <div class="project-header">
                        <span class="project-indicator" aria-hidden="true">&rarr;</span>
                        <span class="project-title">{project.title}</span>
                        <span class="project-status" style="background: {getStatusColor(project.status)}">{statusLabel(project.status)}</span>
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
                      <div class="project-card-footer">
                        <span class="project-card-hint">View details</span>
                        {#if project.sources?.[0]?.url}
                          <a
                            class="project-source-link"
                            href={project.sources[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >View source →</a>
                        {/if}
                      </div>
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
    {/each}
  {:else}
    <!-- County selected: show county goals first, then Regional section -->
    <div class="county-section" id="section-{selectedCounty}">
      <h2 class="county-header">
        {getCountyName(selectedCounty ?? '')}
        {#if filtered.length > 0}
          <span class="goal-count">({filtered.length})</span>
        {/if}
      </h2>
      {#if filtered.length === 0}
        <p class="no-goals-message">No goal information is available for this county.</p>
      {:else}
        <div class="table-scroll">
          <table class="data-table goals-data-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Orgs</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as goal}
              <tr class="goal-row">
                <td data-label="Goal">{goal.goal}</td>
                <td data-label="Status">
                  {#if goal.status_related_projects}
                    {#each parseStatusContent(goal.status_related_projects) as part}
                      {#if part.type === 'url'}
                        <a href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>
                      {:else}
                        {part.value}
                      {/if}
                    {/each}
                  {/if}
                </td>
                <td data-label="Actions">{goal.actions || ''}</td>
                <td data-label="Orgs">
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
                    <div
                      class="project-card"
                      role="button"
                      tabindex="0"
                      aria-label="View details for {project.title}"
                      style="--status-color: {getStatusColor(project.status)}"
                      on:click={(e) => handleProjectCardClick(project, e)}
                      on:keydown={(e) => handleProjectCardKeydown(project, e)}
                    >
                      <div class="project-header">
                        <span class="project-indicator" aria-hidden="true">&rarr;</span>
                        <span class="project-title">{project.title}</span>
                        <span class="project-status" style="background: {getStatusColor(project.status)}">{statusLabel(project.status)}</span>
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
                      <div class="project-card-footer">
                        <span class="project-card-hint">View details</span>
                        {#if project.sources?.[0]?.url}
                          <a
                            class="project-source-link"
                            href={project.sources[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >View source →</a>
                        {/if}
                      </div>
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
    
    <!-- Regional Section (below selected county) -->
    <div class="county-section" id="section-regional">
      <h2 class="county-header">
        Regional
        {#if regionalGoals.length > 0}
          <span class="goal-count">({regionalGoals.length})</span>
        {/if}
      </h2>
      {#if regionalGoals.length === 0}
        <p class="no-goals-message">No regional goal information is available.</p>
      {:else}
        <div class="table-scroll">
          <table class="data-table goals-data-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Orgs</th>
            </tr>
          </thead>
          <tbody>
            {#each regionalGoals as goal}
              <tr class="goal-row">
                <td data-label="Goal">{goal.goal}</td>
              <td data-label="Status">
                {#if goal.status_related_projects}
                  {#each parseStatusContent(goal.status_related_projects) as part}
                    {#if part.type === 'url'}
                      <a href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>
                    {:else}
                      {part.value}
                    {/if}
                  {/each}
                {/if}
              </td>
              <td data-label="Actions">{goal.actions || ''}</td>
              <td data-label="Orgs">
                {#if goal.related_orgs && goal.related_orgs.length > 0}
                  {#each goal.related_orgs as org}
                    <div class="related-org">
                      {#if org.url}
                        <a href={org.url} target="_blank" rel="noopener noreferrer">{org.name}</a>
                      {:else}
                        <span>{org.name}</span>
                      {/if}
                      {#if org.contact_info}
                        <span class="contact-info">{org.contact_info}</span>
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
                  <div
                    class="project-card"
                    role="button"
                    tabindex="0"
                    aria-label="View details for {project.title}"
                    style="--status-color: {getStatusColor(project.status)}"
                    on:click={(e) => handleProjectCardClick(project, e)}
                    on:keydown={(e) => handleProjectCardKeydown(project, e)}
                  >
                    <div class="project-header">
                      <span class="project-indicator" aria-hidden="true">&rarr;</span>
                      <span class="project-title">{project.title}</span>
                      <span class="project-status" style="background: {getStatusColor(project.status)}">{statusLabel(project.status)}</span>
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
                    <div class="project-card-footer">
                      <span class="project-card-hint">View details</span>
                      {#if project.sources?.[0]?.url}
                        <a
                          class="project-source-link"
                          href={project.sources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >View source →</a>
                      {/if}
                    </div>
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
  {/if}
</div>

<style>
.goals-table {
  margin-top: 2rem;
  container-type: inline-size;
  container-name: goals-layout;
  scroll-behavior: smooth;
}
.goals-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.18);
}
.county-jump {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  align-items: center;
  flex: 1 1 auto;
  font-size: 0.86rem;
}
.county-jump a {
  color: var(--text-muted, #c6cbc6);
  text-decoration: none;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid transparent;
  line-height: 1.3;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.county-jump a:hover,
.county-jump a:focus-visible {
  color: var(--text-on-dark, #f3f2ee);
  background: rgba(66, 128, 196, 0.14);
  border-color: rgba(66, 128, 196, 0.45);
  outline: none;
}
.clear-filter {
  font: inherit;
  font-size: 0.82rem;
  color: inherit;
  background: rgba(66, 128, 196, 0.16);
  border: 1px solid rgba(66, 128, 196, 0.55);
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.clear-filter:hover,
.clear-filter:focus-visible {
  background: rgba(66, 128, 196, 0.28);
  outline: none;
}
.county-section {
  margin-bottom: 2.5rem;
  scroll-margin-top: 1rem;
}
.county-header {
  font-size: clamp(1.2rem, 1rem + 1vw, 1.4rem);
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--accent-color, #3b82f6);
}
.goal-count {
  font-weight: 400;
  color: var(--text-dim, #9fa7a2);
  font-size: 0.82em;
  margin-left: 0.35rem;
}
.no-goals-message {
  color: var(--text-muted, #94a3b8);
  font-style: italic;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px dashed var(--border-subtle, #334155);
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
  position: relative;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--status-color) 12%, transparent) 0%,
    color-mix(in srgb, var(--status-color) 4%, transparent) 100%);
  border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
  border-left: 4px solid var(--status-color);
  border-radius: 8px;
  padding: 0.875rem 2.5rem 0.875rem 1rem;
  margin-left: 1rem;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease, background 0.2s ease;
}
.project-card::after {
  content: '›';
  position: absolute;
  top: 0.65rem;
  right: 0.85rem;
  font-size: 1.5rem;
  line-height: 1;
  color: color-mix(in srgb, var(--status-color) 70%, transparent);
  font-weight: 700;
  pointer-events: none;
  transition: transform 0.2s ease, color 0.2s ease;
}
.project-card:hover {
  border-color: color-mix(in srgb, var(--status-color) 50%, transparent);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--status-color) 15%, transparent);
  transform: translateY(-1px);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--status-color) 18%, transparent) 0%,
    color-mix(in srgb, var(--status-color) 7%, transparent) 100%);
}
.project-card:hover::after,
.project-card:focus-visible::after {
  color: var(--status-color);
  transform: translateX(3px);
}
.project-card:focus-visible {
  outline: 2px solid var(--atl-blue, #4280c4);
  outline-offset: 2px;
  border-color: color-mix(in srgb, var(--status-color) 60%, transparent);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--status-color) 25%, transparent);
}
.project-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.project-indicator {
  color: var(--status-color);
  font-weight: bold;
  font-size: 1.1em;
}
.project-title {
  font-weight: 600;
  color: var(--text-on-dark, #f3f2ee);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--status-color) 45%, transparent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  transition: text-decoration-color 0.2s ease;
}
.project-card:hover .project-title,
.project-card:focus-visible .project-title {
  text-decoration-color: var(--status-color);
}
.project-status {
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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
.project-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.65rem;
  padding-top: 0.55rem;
  border-top: 1px dashed color-mix(in srgb, var(--status-color) 25%, transparent);
  font-size: 0.82em;
  flex-wrap: wrap;
}
.project-card-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-on-dark, #f3f2ee);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.project-card-hint::after {
  content: '→';
  color: var(--status-color);
  font-weight: 700;
  display: inline-block;
  transition: transform 0.2s ease;
}
.project-card:hover .project-card-hint::after,
.project-card:focus-visible .project-card-hint::after {
  transform: translateX(3px);
}
.project-source-link {
  color: var(--atl-blue, #4280c4);
  text-decoration: none;
  font-weight: 500;
  white-space: nowrap;
}
.project-source-link:hover,
.project-source-link:focus-visible {
  color: var(--text-on-dark, #f3f2ee);
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
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
  font-size: 0.8em;
  color: var(--text-dim, #9fa7a2);
  font-style: italic;
  line-height: 1.3;
  margin-top: 0.1rem;
}

@container goals-layout (max-width: 50rem) {

  .table-scroll {
    overflow-x: visible;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .goals-data-table {
    width: 100%;
    min-width: 0;
    border-collapse: separate;
    border-spacing: 0;
  }

  .goals-data-table thead {
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

  .goals-data-table,
  .goals-data-table tbody,
  .goals-data-table .goal-row,
  .goals-data-table .project-row,
  .goals-data-table .goal-row td,
  .goals-data-table .project-row td {
    display: block;
    width: 100%;
  }

  .goals-data-table tbody {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .goals-data-table .goal-row {
    border: 1px solid var(--border-subtle, #334155);
    border-radius: 10px;
    overflow: hidden;
    background: color-mix(in srgb, var(--surface-2, #10201e) 94%, black);
  }

  .goals-data-table .goal-row td {
    border: 0;
    border-bottom: 1px solid var(--border-subtle, #334155);
    padding: 0.625rem 0.75rem;
    display: grid;
    grid-template-columns: minmax(7.5rem, 42%) 1fr;
    gap: 0.5rem;
    align-items: start;
    font-size: 0.92rem;
  }

  .goals-data-table .goal-row td:last-child {
    border-bottom: 0;
  }

  .goals-data-table .goal-row td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    line-height: 1.35;
  }

  .goals-data-table .project-row td {
    border: 0;
    padding: 0;
  }

  .nested-cell {
    padding-left: 0 !important;
    padding-right: 0 !important;
    padding-bottom: 0 !important;
  }

  .project-card {
    margin-left: 0;
  }

  .project-header {
    align-items: flex-start;
  }
}

@container goals-layout (max-width: 34rem) {
  .goals-data-table .goal-row td {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
}
</style>
