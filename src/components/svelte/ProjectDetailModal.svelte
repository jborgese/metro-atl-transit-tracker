<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import Portal from './Portal.svelte';
  import type { Goal, Project } from '@/types/content';
  import { statusLabel, getStatusColor } from '@/utils/statusHelpers';
  import { getCountyName } from '@/utils/countyLookup';
  import { formatDate, formatTimestamp } from '@/utils/dateFormat';
  import { getRelatedGoals } from '@/utils/projectRelations';

  export let open = false;
  export let project: Project | null = null;
  export let goals: Goal[] = [];
  export let countyNames: Record<string, string> = {};

  const dispatch = createEventDispatcher<{ close: void }>();

  let closeButton: HTMLButtonElement | null = null;
  let previouslyFocused: HTMLElement | null = null;

  $: if (typeof document !== 'undefined') {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  $: if (open && typeof document !== 'undefined') {
    previouslyFocused = (document.activeElement as HTMLElement) ?? null;
    tick().then(() => closeButton?.focus());
  }

  function close() {
    open = false;
    dispatch('close');
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  }

  type Milestone = { title: string; date: string | null };

  function normalizeMilestones(raw: Project['milestones']): Milestone[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry): Milestone | null => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const title = typeof record.title === 'string' ? record.title : '';
        const date = typeof record.date === 'string' ? record.date : null;
        if (!title && !date) return null;
        return { title, date };
      })
      .filter((m): m is Milestone => m !== null)
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      });
  }

  function humanizeScope(scope: string | undefined): string {
    if (!scope) return '';
    switch (scope) {
      case 'corridor':
        return 'Corridor';
      case 'regional':
        return 'Regional';
      case 'county':
        return 'County';
      case 'local':
        return 'Local';
      default:
        return scope.charAt(0).toUpperCase() + scope.slice(1);
    }
  }

  $: milestones = project ? normalizeMilestones(project.milestones) : [];
  $: relatedGoals = project ? getRelatedGoals(project, goals) : [];
  $: timelineText = (() => {
    if (!project) return '';
    const start = formatDate(project.start_date);
    const end = project.end_date ? formatDate(project.end_date) : '';
    if (start && end) return `${start} → ${end}`;
    if (start && !end) return `${start} → ongoing`;
    if (!start && end) return `through ${end}`;
    return '';
  })();
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open && project}
  <Portal>
    <div
      class="modal-backdrop"
      on:click={handleBackdropClick}
      on:keydown={handleBackdropKeydown}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-detail-title"
    >
      <div class="modal-content">
        <button
          bind:this={closeButton}
          class="modal-close"
          on:click={close}
          aria-label="Close project details"
          type="button"
        >
          &times;
        </button>

        <header class="project-header-row">
          <div class="title-stack">
            <h2 id="project-detail-title">{project.title}</h2>
            <div class="badge-row">
              <span
                class="status-badge"
                style="background: {getStatusColor(project.status)}"
              >{statusLabel(project.status)}</span>
              {#if project.is_archived === true}
                <span class="archived-badge">Archived</span>
              {/if}
            </div>
          </div>
        </header>

        {#if project.summary}
          <p class="summary">{project.summary}</p>
        {/if}

        <section class="facts">
          {#if timelineText}
            <div class="fact">
              <h3>Timeline</h3>
              <p>{timelineText}</p>
            </div>
          {/if}
          {#if project.geo_scope}
            <div class="fact">
              <h3>Geography</h3>
              <p>{humanizeScope(project.geo_scope)}</p>
            </div>
          {/if}
          {#if project.modes && project.modes.length > 0}
            <div class="fact">
              <h3>Modes</h3>
              <ul class="chips" aria-label="Transit modes">
                {#each project.modes as mode}
                  <li class="chip">{mode}</li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if project.lead_org}
            <div class="fact">
              <h3>Lead organization</h3>
              <p>
                {#if project.lead_org.url}
                  <a href={project.lead_org.url} target="_blank" rel="noopener noreferrer">{project.lead_org.name}</a>
                {:else}
                  {project.lead_org.name}
                {/if}
              </p>
            </div>
          {/if}
          {#if project.partners && project.partners.length > 0}
            <div class="fact fact-wide">
              <h3>Partners</h3>
              <ul class="partners">
                {#each project.partners as partner}
                  <li>
                    {#if partner.url}
                      <a href={partner.url} target="_blank" rel="noopener noreferrer">{partner.name}</a>
                    {:else}
                      {partner.name}
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </section>

        {#if project.related_counties && project.related_counties.length > 0}
          <section class="block">
            <h3>Counties served</h3>
            <ul class="chips" aria-label="Counties served">
              {#each project.related_counties as geoid}
                <li class="chip chip-county">{getCountyName(geoid, countyNames)}</li>
              {/each}
            </ul>
          </section>
        {/if}

        <section class="block">
          <h3>Milestones</h3>
          {#if milestones.length === 0}
            <p class="muted">No milestones published yet.</p>
          {:else}
            <ul class="milestones">
              {#each milestones as m}
                <li>
                  {#if m.date}
                    <time datetime={m.date}>{formatDate(m.date)}</time>
                    <span class="milestone-sep"> — </span>
                  {/if}
                  <span>{m.title}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        {#if relatedGoals.length > 0}
          <section class="block">
            <h3>Related goals</h3>
            <ul class="related-goals">
              {#each relatedGoals as goal}
                <li>{goal.goal}</li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if project.sources && project.sources.length > 0}
          <section class="block">
            <h3>Sources</h3>
            <ul class="sources">
              {#each project.sources as source}
                <li>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                  {#if source.last_verified}
                    <span class="source-verified">verified {formatDate(source.last_verified)}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if project.provenance}
          <footer class="provenance">
            {#if project.provenance.updated_at}
              <span>
                Updated {formatTimestamp(project.provenance.updated_at)}
                {#if project.provenance.updated_by}
                  by {project.provenance.updated_by}
                {/if}
              </span>
            {/if}
            {#if project.provenance.license}
              <span class="provenance-sep">·</span>
              <span>License: {project.provenance.license}</span>
            {/if}
          </footer>
        {/if}
      </div>
    </div>
  </Portal>
{/if}

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200000;
  padding: 1rem;
}

.modal-content {
  position: relative;
  width: min(100%, 44rem);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface-2);
  color: var(--text-on-dark);
  border: 1px solid var(--border-subtle);
  border-radius: 0.75rem;
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: var(--shadow-2);
  container-type: inline-size;
  container-name: project-modal;
}

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.75rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

.modal-close:hover,
.modal-close:focus-visible {
  color: var(--text-on-dark);
  background: rgba(255, 255, 255, 0.1);
  outline: none;
}

.project-header-row {
  padding-right: 2.5rem;
  margin-bottom: 1rem;
}

.title-stack {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.modal-content h2 {
  font-size: clamp(1.4rem, 1.1rem + 1vw, 1.85rem);
  font-weight: 700;
  line-height: 1.2;
  margin: 0;
  color: var(--text-on-dark);
  letter-spacing: -0.01em;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.status-badge {
  display: inline-block;
  color: #fff;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.archived-badge {
  display: inline-block;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary {
  font-family: var(--font-serif);
  font-size: 1.02rem;
  line-height: 1.6;
  color: var(--text-on-dark);
  margin: 0 0 1.5rem 0;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.fact {
  min-width: 0;
}

.fact-wide {
  grid-column: 1 / -1;
}

.fact h3,
.block h3 {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.4rem 0;
}

.fact p {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.45;
  color: var(--text-on-dark);
  word-wrap: break-word;
}

.fact a {
  color: var(--atl-blue);
  text-decoration: none;
}

.fact a:hover,
.fact a:focus-visible {
  color: var(--text-on-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
}

.block {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.block:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  display: inline-block;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  font-size: 0.82rem;
  color: var(--text-on-dark);
  line-height: 1.4;
}

.chip-county {
  background: rgba(66, 128, 196, 0.14);
  border-color: rgba(66, 128, 196, 0.4);
}

.partners {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.75rem;
}

.partners li {
  font-size: 0.95rem;
  color: var(--text-on-dark);
}

.partners li + li::before {
  content: '·';
  margin-right: 0.75rem;
  color: var(--text-dim);
}

.partners a {
  color: var(--atl-blue);
  text-decoration: none;
}

.partners a:hover,
.partners a:focus-visible {
  color: var(--text-on-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
}

.milestones {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.milestones li {
  padding: 0.55rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--atl-blue);
  border-radius: 6px;
  font-size: 0.95rem;
  line-height: 1.4;
}

.milestones time {
  font-weight: 600;
  color: var(--text-on-dark);
}

.milestone-sep {
  color: var(--text-dim);
}

.related-goals {
  list-style: disc;
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-on-dark);
  font-size: 0.95rem;
  line-height: 1.5;
}

.related-goals li::marker {
  color: var(--atl-blue);
}

.sources {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.sources li {
  font-size: 0.95rem;
  line-height: 1.4;
}

.sources a {
  color: var(--atl-blue);
  text-decoration: none;
  font-weight: 500;
}

.sources a:hover,
.sources a:focus-visible {
  color: var(--text-on-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
}

.source-verified {
  margin-left: 0.5rem;
  color: var(--text-dim);
  font-size: 0.82rem;
}

.muted {
  color: var(--text-dim);
  font-style: italic;
  margin: 0;
}

.provenance {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-dim);
  font-size: 0.82rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  align-items: center;
}

.provenance-sep {
  color: var(--border-strong);
}

@container project-modal (max-width: 30rem) {
  .facts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .modal-backdrop {
    padding: 0.5rem;
  }

  .modal-content {
    border-radius: 0.5rem;
    max-height: 92vh;
    padding: 1.25rem;
  }

  .modal-close {
    top: 0.5rem;
    right: 0.5rem;
  }
}
</style>
