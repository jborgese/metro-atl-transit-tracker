<script lang="ts">
import { onMount } from 'svelte';
import BaseLayout from '../layouts/BaseLayout.svelte';
import MetroMap from '../components/svelte/MetroMap.svelte';
import GoalsTable from '../components/svelte/GoalsTable.svelte';
import ProjectDetailModal from '../components/svelte/ProjectDetailModal.svelte';
import type { Goal, Project } from '@/types/content';

export let data: {
  projects: Project[];
  goals: Goal[];
};

let projects: Project[] = [];
let goals: Goal[] = [];

$: projects = data?.projects ?? [];
$: goals = data?.goals ?? [];

let selectedCounty: string | null = null;
let mapRef: MetroMap;

let selectedProjectId: string | null = null;
let projectModalOpen = false;

$: selectedProject = selectedProjectId
  ? projects.find((p) => p.id === selectedProjectId) ?? null
  : null;

function handleCountySelected(event: CustomEvent<{ geoid: string | null }>) {
  selectedCounty = event.detail.geoid;
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

function handleSelectProject(event: CustomEvent<{ project: Project }>) {
  openProject(event.detail.project);
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
      A public hub for Metro Atlanta transit goals, agencies, and advocacy — your jumping-off point for deeper sources and ways to take action.
    </p>
    <MetroMap bind:this={mapRef} on:countySelected={handleCountySelected} />
    <GoalsTable
      {goals}
      {projects}
      {selectedCounty}
      on:clearCounty={handleClearCounty}
      on:selectProject={handleSelectProject}
    />
  </section>
</BaseLayout>

<ProjectDetailModal
  bind:open={projectModalOpen}
  project={selectedProject}
  {goals}
  on:close={closeProject}
/>
