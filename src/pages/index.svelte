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
  <section class="page-stack">
    <div class="page-header">
      <h1>Metro Atlanta Interface for Transit Advocacy Intelligence</h1>
    </div>
    <p class="lede">
      A public, data-driven hub for understanding transit goals, agencies, and advocacy efforts across Metro Atlanta.
      Use this site as a jumping-off point for deeper sources and how to take action.
    </p>
    <MetroMap on:countySelected={handleCountySelected} />
    <GoalsTable {goals} {projects} {selectedCounty} />
  </section>
</BaseLayout>
