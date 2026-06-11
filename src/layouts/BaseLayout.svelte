<script module lang="ts">
  import "../styles/global.css";
</script>

<script lang="ts">
  import FeedbackModal from '../components/svelte/FeedbackModal.svelte';
  import MethodologyModal from '../components/svelte/MethodologyModal.svelte';
  import type { Snippet } from 'svelte';

  let {
    title = 'Metro Atlanta Interface for Transit Advocacy Intelligence',
    description = 'A public, data-driven Metro Atlanta transit advocacy intelligence hub.',
    children,
  }: {
    title?: string;
    description?: string;
    children?: Snippet;
  } = $props();

  let methodologyOpen = $state(false);
  let feedbackOpen = $state(false);
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
      <picture>
        <source srcset="/mai-tai-logo.avif" type="image/avif" />
        <source srcset="/mai-tai-logo.webp" type="image/webp" />
        <img
          src="/mai-tai-logo.png"
          alt="MAI TAI"
          class="site-logo"
          width="712"
          height="712"
          loading="eager"
          fetchpriority="high"
          decoding="async"
        />
      </picture>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a class="site-nav-link" href="/history">History</a>
      <a class="site-nav-link" href="/admin" data-sveltekit-reload>Admin</a>
      <button class="site-nav-link" onclick={() => methodologyOpen = true}>Methodology</button>
    </nav>
  </div>
</header>

<main id="content" class="main-content">
  {@render children?.()}
</main>

<MethodologyModal bind:open={methodologyOpen} />
<FeedbackModal bind:open={feedbackOpen} />

<footer class="site-footer">
  <span>Not affiliated with MARTA, ARC, GDOT, or any governing body.</span>
  <button class="site-footer-link" onclick={() => feedbackOpen = true}>Send feedback</button>
</footer>
