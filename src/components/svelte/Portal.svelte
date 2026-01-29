<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let container: HTMLDivElement;

  onMount(() => {
    // Move this component's root node to document.body so children render there
    if (container && document && document.body) {
      document.body.appendChild(container);
    }
  });

  onDestroy(() => {
    try {
      container?.remove();
    } catch (e) {
      // ignore
    }
  });
</script>

<div bind:this={container}>
  <slot />
</div>

<style>
  /* keep portal wrapper unstyled by default */
</style>
