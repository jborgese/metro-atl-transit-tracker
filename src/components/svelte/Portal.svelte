<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
  let container: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (container && document && document.body) {
      document.body.appendChild(container);
    }
  });

  onDestroy(() => {
    try {
      container?.remove();
    } catch {
      // ignore
    }
  });
</script>

<div bind:this={container}>
  {@render children?.()}
</div>

<style>
  /* keep portal wrapper unstyled by default */
</style>
