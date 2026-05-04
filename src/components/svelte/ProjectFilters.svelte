<script lang="ts">
  let {
    availableModes = [],
    selectedModes = $bindable<string[]>([]),
    onchange,
  }: {
    availableModes?: string[];
    selectedModes?: string[];
    onchange?: (detail: { selectedModes: string[] }) => void;
  } = $props();

  function toggle(mode: string) {
    if (selectedModes.includes(mode)) {
      selectedModes = selectedModes.filter((m) => m !== mode);
    } else {
      selectedModes = [...selectedModes, mode];
    }
    onchange?.({ selectedModes });
  }

  function clearAll() {
    selectedModes = [];
    onchange?.({ selectedModes });
  }
</script>

<fieldset class="project-filters text-xs text-neutral-300">
  <legend class="sr-only">Filter projects by mode</legend>
  <div class="flex items-center gap-2 mb-2">
    <button type="button" class="text-xs underline" onclick={clearAll}>Show all</button>
  </div>

  <div class="grid grid-cols-2 gap-2">
    {#each availableModes as mode}
      <label class="inline-flex items-center gap-2">
        <input type="checkbox" checked={selectedModes.includes(mode)} onchange={() => toggle(mode)} />
        <span class="capitalize">{mode.replace(/-/g, ' ')}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .project-filters input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
  }
</style>
