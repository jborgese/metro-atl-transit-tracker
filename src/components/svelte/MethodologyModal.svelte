<script lang="ts">
  import Portal from './Portal.svelte';

  export let open = false;

  $: if (typeof document !== 'undefined') {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  function close() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleBackdropKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <Portal>
    <div
      class="modal-backdrop"
      on:click={handleBackdropClick}
      on:keydown={handleBackdropKeydown}
      tabindex="-1"
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
          <h2>Project Status Colors</h2>
          <p>Project cards are color-coded by status using a palette inspired by the 1996 Atlanta Summer Olympics:</p>
          <table class="status-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Color</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="status-badge" style="background: #4280c4">Planning</span></td>
                <td>Olympic Blue</td>
              </tr>
              <tr>
                <td><span class="status-badge" style="background: #8a62b0">Public Outreach</span></td>
                <td>Olympic Purple</td>
              </tr>
              <tr>
                <td><span class="status-badge" style="background: #a32f65">Funding Application</span></td>
                <td>Olympic Magenta</td>
              </tr>
              <tr>
                <td><span class="status-badge" style="background: #c4a042">Implementation</span></td>
                <td>Gold</td>
              </tr>
              <tr>
                <td><span class="status-badge" style="background: #2d8659">Completed</span></td>
                <td>Forest Green</td>
              </tr>
              <tr>
                <td><span class="status-badge" style="background: #a73a32">Ongoing</span></td>
                <td>Olympic Terracotta</td>
              </tr>
            </tbody>
          </table>
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
  z-index: 200000;
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

.status-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.status-table th,
.status-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-table th {
  background: rgba(255, 255, 255, 0.05);
  color: #e0e7ef;
  font-weight: 600;
}

.status-table td {
  color: #d1d5db;
}

.status-badge {
  display: inline-block;
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
