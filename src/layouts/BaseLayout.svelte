<script context="module" lang="ts">
  import "../styles/global.css";
</script>

<script lang="ts">
  import MethodologyModal from '../components/svelte/MethodologyModal.svelte';

  export let title: string = 'Metro Atlanta Transit Tracker';
  export let description: string = 'A public, data-driven Metro Atlanta transit advocacy intelligence hub.';

  let methodologyOpen = false;
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content={description} />
  <title>{title}</title>
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

<a class="skip-link" href="#content">
  Skip to content
</a>

<header class="site-header">
  <div class="site-header-inner">
    <a href="/" class="site-title">
      <img src="/mai-tai-logo.png" alt="MAI TAI" class="site-logo" />
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a class="site-nav-link" href="/history">History</a>
      <a class="site-nav-link" href="/admin" data-sveltekit-reload>Admin</a>
      <button class="site-nav-link" on:click={() => methodologyOpen = true}>Methodology</button>
    </nav>
  </div>
</header>

<main id="content" class="main-content">
  <slot />
</main>

<MethodologyModal bind:open={methodologyOpen} />

<footer class="site-footer">
  Not affiliated with MARTA, ARC, GDOT, or any governing body.
</footer>
