<script context="module" lang="ts">
  import "../styles/global.css";
</script>

<script lang="ts">
  export let title: string = 'Metro Atlanta Transit Tracker';
  export let description: string = 'A public, data-driven Metro Atlanta transit advocacy intelligence hub.';
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content={description} />
  <title>{title}</title>
  
</svelte:head>

<a class="skip-link" href="#content">
  Skip to content
</a>

<header class="site-header">
  <div class="site-header-inner">
    <a href="/" class="site-title">
      Metro ATL Transit Tracker
    </a>
    <nav class="site-nav">
      <a class="site-nav-link" href="/methodology">Methodology</a>
    </nav>
  </div>
</header>

<main id="content" class="main-content">
  <slot />
</main>

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
}
.site-nav {
  display: flex;
  gap: 1.5rem;
}
.site-nav-link {
  color: #e0e7ef;
  text-decoration: none;
  font-weight: 500;
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
