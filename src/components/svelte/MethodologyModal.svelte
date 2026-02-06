<script lang="ts">
  import Portal from './Portal.svelte';

  export let open = false;

  function close() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <Portal>
    <div
      class="modal-backdrop"
      on:click={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
    >
      <div class="modal-content">
        <button class="modal-close" on:click={close} aria-label="Close">
          &times;
        </button>
        <article class="methodology-article">
          <h1 id="methodology-title">Methodology</h1>
          <p>
            This site aggregates publicly available information about transit goals and projects across Metro Atlanta.
            Status claims aim to be source-backed and time-stamped.
          </p>
          <h2>Definitions</h2>
          <ul>
            <li>
              <strong>Metro Atlanta</strong>: county GEOIDs &mdash; Fulton (13121), DeKalb (13089), Cobb (13067), and Gwinnett (13135) &mdash; used to highlight, select, and compute bounds.
            </li>
            <li>
              <strong>GEOID</strong>: a U.S. Census Bureau's geographic identifier that uniquely identifies a county or other census geography, used in TIGER/Line and Census data for reliable matching.
            </li>
            <li>
              <strong>Status</strong>: binary for advocacy points; progress for projects where measurable phases exist.
            </li>
            <li>
              <strong>Sources</strong>: official agency releases, public meeting minutes, reputable reporting, and documented evidence.
            </li>
          </ul>
          <h2>Disclaimer</h2>
          <p>
            Not affiliated with MARTA, ARC, GDOT, or any governing body. This site does not advocate highway expansion and strives to be non-partisan.
          </p>
        </article>
      </div>
    </div>
  </Portal>
{/if}

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  position: relative;
  width: min(100%, 52rem);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface-2);
  border-radius: 0.75rem;
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  color: #a3a3a3;
  font-size: 1.75rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.modal-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.methodology-article h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #fff;
}

.methodology-article h2 {
  font-size: 1.25rem;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  color: #e0e7ef;
}

.methodology-article p {
  color: #d1d5db;
  line-height: 1.6;
}

.methodology-article ul {
  margin-left: 1.5rem;
  margin-bottom: 1.5rem;
  color: #d1d5db;
}

.methodology-article li {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.methodology-article strong {
  color: #fff;
}

@media (max-width: 600px) {
  .modal-content {
    border-radius: 0.5rem;
    max-height: 92vh;
  }

  .modal-close {
    top: 0.5rem;
    right: 0.5rem;
  }

  .methodology-article h1 {
    font-size: 1.6rem;
  }

  .methodology-article h2 {
    font-size: 1.1rem;
  }
}
</style>
