<script lang="ts">
import BaseLayout from '../layouts/BaseLayout.svelte';
import MetroMap from '../components/svelte/MetroMap.svelte';
import GoalsTable from '../components/svelte/GoalsTable.svelte';
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

function handleCountySelected(event: CustomEvent<{ geoid: string | null }>) {
  selectedCounty = event.detail.geoid;
}

function handleClearCounty() {
  selectedCounty = null;
  mapRef?.clearSelection?.();
}
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
    <GoalsTable {goals} {projects} {selectedCounty} on:clearCounty={handleClearCounty} />
  </section>
</BaseLayout>
