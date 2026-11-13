<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';

  let { children }: { children?: Snippet } = $props();

  const moveToBody: Attachment<HTMLDivElement> = (node) => {
    document.body.appendChild(node);
    return () => node.remove();
  };
</script>

<div {@attach moveToBody}>
  {@render children?.()}
</div>

<style>
  /* keep portal wrapper unstyled by default */
</style>
