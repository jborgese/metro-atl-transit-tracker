<script lang="ts">
import BaseLayout from '../layouts/BaseLayout.svelte';
</script>

<BaseLayout title="Methodology | Metro ATL Transit Tracker">
  <div class="methodology-container">
    <article class="methodology-article">
      <h1>Methodology</h1>
      <p>
        This site aggregates publicly available information about transit goals and projects across Metro Atlanta.
        Status claims aim to be source-backed and time-stamped.
      </p>
      <h2>Definitions</h2>
      <ul>
        <li>
          <strong>Metro Atlanta</strong>:  county GEOIDs — Fulton (13121), DeKalb (13089), Cobb (13067), and Gwinnett (13135) — used to highlight, select, and compute bounds.
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
</BaseLayout>

<style>
.methodology-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}
.methodology-article {
  background: #18181b;
  border-radius: 0.5rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.methodology-article h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
}
.methodology-article h2 {
  font-size: 1.25rem;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
}
.methodology-article ul {
  margin-left: 1.5rem;
  margin-bottom: 1.5rem;
}
</style>
