<script lang="ts">
  import Index from '../pages/index.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<Index {data} />
