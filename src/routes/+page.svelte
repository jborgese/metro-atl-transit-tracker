<script lang="ts">
  import Index from '../pages/index.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<Index {data} />
