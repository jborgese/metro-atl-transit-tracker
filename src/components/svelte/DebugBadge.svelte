<script lang="ts">
  let {
    selectedCountyKey = 'none',
    availableModesCount = 0,
    relatedProjectsCount = 0,
  }: {
    selectedCountyKey?: string;
    availableModesCount?: number;
    relatedProjectsCount?: number;
  } = $props();
</script>

<div style="z-index: var(--z-debug);">
  <div class="font-medium">Debug</div>
  <div>selected: {selectedCountyKey}</div>
  <div>available modes: {availableModesCount}</div>
  <div>related projects: {relatedProjectsCount}</div>
</div>
