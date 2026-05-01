<script lang="ts">
  import { orgLogos } from '../../data/static/orgLogos';
  export let county: any;

  // Helper to get logo URL by agency/group name
  function getLogo(name: string): string | undefined {
    const logo = orgLogos[name];
    return logo === null ? undefined : logo;
  }
</script>

<div class="county-panel-content">
  <h2 class="panel-header">{county.display_name}</h2>

  <section class="panel-section">
      <h3 class="panel-subheader">Governance</h3>
      <a class="panel-link" href={county.governance.official_website} target="_blank" rel="noopener">
        {county.governance.governing_body}
      </a>
      {#if county.governance.groups && county.governance.groups.length}
        <ul class="panel-list">
          {#each county.governance.groups as group}
            <li>
              {#if getLogo(group.name)}
                <a href={group.website} target="_blank" rel="noopener">
                  <img src={getLogo(group.name)} alt={group.name} class="panel-logo" width="160" height="64" loading="lazy" decoding="async" />
                  <span class="sr-only">{group.name}</span>
                </a>
              {:else}
                <a class="panel-link" href={group.website} target="_blank" rel="noopener">{group.name}</a>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
  </section>

  <section class="panel-section">
    <h3 class="panel-subheader">Transit Agencies</h3>
    {#if county.primary_transit_agencies && county.primary_transit_agencies.length}
      <ul class="panel-list">
        {#each county.primary_transit_agencies as agency}
          <li>
            {#if getLogo(agency.name)}
              <a href={agency.contact_url} target="_blank" rel="noopener">
                <img src={getLogo(agency.name)} alt={agency.name} class="panel-logo" width="160" height="64" loading="lazy" decoding="async" />
                <span class="sr-only">{agency.name}</span>
              </a>
            {:else}
              <a class="panel-link" href={agency.contact_url} target="_blank" rel="noopener">{agency.name}</a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <span class="panel-muted">No agencies listed.</span>
    {/if}
  </section>

  <section class="panel-section">
    <h3 class="panel-subheader">Advocacy Groups</h3>
    {#if county.advocacy && county.advocacy.groups && county.advocacy.groups.length}
      <ul class="panel-list">
        {#each county.advocacy.groups as group}
          <li>
            {#if getLogo(group.name)}
              <a href={group.website} target="_blank" rel="noopener">
                <img src={getLogo(group.name)} alt={group.name} class="panel-logo" width="160" height="64" loading="lazy" decoding="async" />
                <span class="sr-only">{group.name}</span>
              </a>
            {:else}
              <a class="panel-link" href={group.website} target="_blank" rel="noopener">{group.name}</a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <span class="panel-muted">No groups listed.</span>
    {/if}
  </section>
</div>
