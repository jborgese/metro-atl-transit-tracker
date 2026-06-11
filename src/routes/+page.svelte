<script lang="ts">
  import { onMount } from 'svelte';
  import BaseLayout from '../layouts/BaseLayout.svelte';
  import MetroMap from '../components/svelte/MetroMap.svelte';
  import GoalsTable from '../components/svelte/GoalsTable.svelte';
  import ProjectDetailModal from '../components/svelte/ProjectDetailModal.svelte';
  import type { Project } from '@/types/content';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const projects = $derived(data?.projects ?? []);
  const goals = $derived(data?.goals ?? []);

  let selectedCounty: string | null = $state(null);
  let mapRef: MetroMap | undefined = $state();

  let selectedProjectId: string | null = $state(null);
  let projectModalOpen = $state(false);

  const selectedProject = $derived(
    selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId) ?? null
      : null
  );

  function handleCountySelected(detail: { geoid: string | null }) {
    selectedCounty = detail.geoid;
  }

  function handleClearCounty() {
    selectedCounty = null;
    mapRef?.clearSelection?.();
  }

  function openProject(project: Project) {
    selectedProjectId = project.id;
    projectModalOpen = true;
    syncUrl(project.id);
  }

  function closeProject() {
    projectModalOpen = false;
    selectedProjectId = null;
    syncUrl(null);
  }

  function handleSelectProject(detail: { project: Project }) {
    openProject(detail.project);
  }

  function syncUrl(projectId: string | null) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (projectId) {
      if (url.searchParams.get('project') === projectId) return;
      url.searchParams.set('project', projectId);
    } else {
      if (!url.searchParams.has('project')) return;
      url.searchParams.delete('project');
    }
    window.history.replaceState({}, '', url);
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    const match = projects.find((p) => p.id === id);
    if (match) {
      selectedProjectId = match.id;
      projectModalOpen = true;
    } else {
      syncUrl(null);
    }
  });
</script>

<BaseLayout>
  <section class="page-stack">
    <div class="page-header">
      <h1>Metro Atlanta Interface for Transit Advocacy Intelligence</h1>
    </div>
    <p class="lede">
      A public hub for Metro Atlanta transit goals, agencies, and advocacy. 
      Your jumping-off point for deeper sources and ways to take action.
    </p>
    {#if data?.usingFallback}
      <p class="fallback-banner" role="status">
        Showing a cached snapshot of projects and goals — live data is temporarily unavailable.
      </p>
    {/if}
    <MetroMap bind:this={mapRef} oncountySelected={handleCountySelected} />
    <GoalsTable
      {goals}
      {projects}
      {selectedCounty}
      onclearCounty={handleClearCounty}
      onselectProject={handleSelectProject}
    />
  </section>
</BaseLayout>

<ProjectDetailModal
  bind:open={projectModalOpen}
  project={selectedProject}
  {goals}
  onclose={closeProject}
/>
