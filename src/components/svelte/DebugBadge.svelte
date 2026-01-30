<script lang="ts">
  export let selectedCountyKey: string = "none";
  export let availableModesCount: number = 0;
  export let relatedProjectsCount: number = 0;
</script>

<div style="z-index:99999;" class="absolute top-4 right-4 rounded bg-black/80 text-white text-xs p-2 border border-neutral-700 shadow-lg">
  <div class="font-medium">Debug</div>
  <div>selected: {selectedCountyKey}</div>
  <div>available modes: {availableModesCount}</div>
  <div>related projects: {relatedProjectsCount}</div>
</div>
