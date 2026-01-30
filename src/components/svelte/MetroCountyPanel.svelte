<script lang="ts">
  import { orgLogos } from '../../data/static/orgLogos';
  export let county: any;

  // Helper to get logo URL by agency/group name
  function getLogo(name: string): string | undefined {
    return orgLogos[name]?.src;
  }
</script>

<div class="county-panel p-4 bg-white rounded shadow max-w-md">
  <h2 class="text-xl font-bold mb-2">{county.display_name}</h2>

  <section class="mb-4">
    <h3 class="font-semibold">Governance</h3>
    <a class="text-blue-600 underline" href={county.governance.official_website} target="_blank" rel="noopener">
      {county.governance.governing_body}
    </a>
  </section>

  <section class="mb-4">
    <h3 class="font-semibold">Transit Agencies</h3>
    {#if county.primary_transit_agencies && county.primary_transit_agencies.length}
      <ul class="space-y-1">
        {#each county.primary_transit_agencies as agency}
          <li>
            {#if getLogo(agency.name)}
              <a href={agency.contact_url} target="_blank" rel="noopener">
                <img src={getLogo(agency.name)} alt={agency.name} class="inline h-6 align-middle mr-2" />
                <span class="sr-only">{agency.name}</span>
              </a>
            {:else}
              <a class="text-blue-600 underline" href={agency.contact_url} target="_blank" rel="noopener">{agency.name}</a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <span>No agencies listed.</span>
    {/if}
  </section>

  <section>
    <h3 class="font-semibold">Advocacy Groups</h3>
    {#if county.advocacy && county.advocacy.groups && county.advocacy.groups.length}
      <ul class="space-y-1">
        {#each county.advocacy.groups as group}
          <li>
            {#if getLogo(group.name)}
              <a href={group.website} target="_blank" rel="noopener">
                <img src={getLogo(group.name)} alt={group.name} class="inline h-6 align-middle mr-2" />
                <span class="sr-only">{group.name}</span>
              </a>
            {:else}
              <a class="text-blue-600 underline" href={group.website} target="_blank" rel="noopener">{group.name}</a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <span>No groups listed.</span>
    {/if}
  </section>
</div>
