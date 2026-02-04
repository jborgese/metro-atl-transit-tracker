<script lang="ts">
import BaseLayout from '../layouts/BaseLayout.svelte';
import MetroMap from '../components/svelte/MetroMap.svelte';
import GoalsTable from '../components/svelte/GoalsTable.svelte';
import { projects, goals } from '../data/geo/loadProjects';
import type { Project, Goal } from '../components/svelte/types';

let selectedCounty: string | null = null;

function handleCountySelected(event: CustomEvent<{ geoid: string | null }>) {
  selectedCounty = event.detail.geoid;
}
</script>

<BaseLayout>
  <section class="main-content">
    <div class="page-header">
      <h1>Metro Atlanta Transit Advocacy Intelligence</h1>
    </div>
    <p>
      A public, data-driven hub for understanding transit goals, agencies, and advocacy efforts across Metro Atlanta.
      Use this site as a jumping-off point for deeper sources and how to take action.
    </p>
    <MetroMap on:countySelected={handleCountySelected} />
    <GoalsTable {goals} {projects} {selectedCounty} />
  </section>
</BaseLayout>

<style>
.main-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem;
}
.page-header {
  margin-bottom: 1.5rem;
}
</style>
