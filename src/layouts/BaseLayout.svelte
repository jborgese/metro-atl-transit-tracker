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
    <nav class="site-nav">
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

<style>
.skip-link {
  position: absolute;
  left: -999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 1000;
}
.skip-link:focus {
  left: 1rem;
  top: 1rem;
  width: auto;
  height: auto;
  padding: 0.5rem 1rem;
  background: #222;
  color: #fff;
  border-radius: 4px;
  outline: 2px solid #fff;
}
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  background: none;
}
.site-header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.site-title {
  font-weight: bold;
  font-size: 1.25rem;
  color: #7dd3fc;
  text-decoration: none;
  display: flex;
  align-items: center;
}
.site-logo {
  height: 8rem;
  width: auto;
}
.site-nav {
  display: flex;
  gap: 1.5rem;
}
.site-nav-link {
  color: #e0e7ef;
  text-decoration: none;
  font-weight: 500;
  background: none;
  border: none;
  font-size: inherit;
  cursor: pointer;
  padding: 0;
}
.site-nav-link:hover {
  color: #fff;
  text-decoration: underline;
}
.site-footer {
  margin-top: 2rem;
  padding: 1rem 0;
  text-align: center;
  color: #a3a3a3;
  font-size: 0.95rem;
}
</style>
