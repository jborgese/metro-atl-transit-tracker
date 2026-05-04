<script lang="ts">
  import BaseLayout from '../../layouts/BaseLayout.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<BaseLayout title="Public Change History | Metro ATL Transit Tracker">
  <section class="history-page">
    <header>
      <h1>Public Change History</h1>
      <p>All project and goal edits, including archive and restore actions.</p>
    </header>

    {#if data.history.length === 0}
      <p>No history entries yet.</p>
    {:else}
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {#each data.history as event (event.id)}
              <tr>
                <td>{new Date(event.timestamp).toLocaleString()}</td>
                <td>{event.action}</td>
                <td>{event.entity_type}:{event.entity_id}</td>
                <td>{event.actor}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</BaseLayout>

<style>
  .history-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .history-page p {
    margin: 0;
    color: var(--text-muted, #c6cbc6);
  }

  .history-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-subtle, rgba(126, 110, 79, 0.3));
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.2);
  }

  .history-table {
    width: 100%;
    min-width: 42rem;
    border-collapse: collapse;
  }

  .history-table th,
  .history-table td {
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
  }

  .history-table th {
    font-family: var(--font-sans, sans-serif);
    font-size: 0.88rem;
    color: #f0f1f0;
  }
</style>
