<script lang="ts">
  import type { FieldIssue } from '#lib/content/formModel/validate.ts';

  interface Props {
    issues: Array<FieldIssue & { href: string }>;
  }

  let { issues }: Props = $props();

  let container: HTMLDivElement | undefined = $state();

  export function focus() {
    container?.focus();
  }

  function goTo(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
    const target = document.getElementById(event.currentTarget.hash.slice(1));
    if (target === null) {
      return;
    }
    event.preventDefault();
    target.focus();
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' });
    }
  }
</script>

{#if issues.length > 0}
  <div class="summary" role="alert" tabindex="-1" bind:this={container}>
    <h3>There is a problem</h3>
    <ul>
      {#each issues as issue, index (`${index}:${issue.path}`)}
        <li><a href={`#${issue.href.replace(/^#/, '')}`} onclick={goTo}>{issue.message}</a></li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .summary {
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--atl-red);
    border-radius: 0.5rem;
    background: var(--surface-1);
  }

  .summary:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }

  ul {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.86rem;
  }

  a {
    color: var(--danger-text);
  }

  a:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
