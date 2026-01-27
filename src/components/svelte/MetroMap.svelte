<script lang="ts">
  import { onMount } from "svelte";
  import * as maplibregl from "maplibre-gl";

  export let height: string = "520px";
  export let title: string = "Metro Atlanta map";
  export let subtitle: string =
    "Interactive county/region map will load here (MapLibre next).";

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | undefined;

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-84.388, 33.749], // Atlanta
      zoom: 9,
      attributionControl: {}, // NOTE: not `true`
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    return () => {
      map?.remove();
      map = undefined;
    };
  });
</script>

<section
  class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
  aria-label={title}
>
  <header class="mb-3 flex items-start justify-between gap-4">
    <div>
      <h2 class="text-base font-semibold tracking-tight text-neutral-100">
        {title}
      </h2>
      <p class="mt-1 text-sm text-neutral-400">
        {subtitle}
      </p>
    </div>

    <div class="text-xs text-neutral-500">
      <span
        class="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1"
      >
        Island: Svelte
      </span>
    </div>
  </header>

  <!-- IMPORTANT: relative + explicit height wrapper -->
  <div
    class="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
    style={`height:${height};`}
  >
    <!-- MapLibre mounts into this element -->
    <div bind:this={mapContainer} class="absolute inset-0"></div>

    <!-- Placeholder overlay (remove once counties layer exists) -->
    <div class="pointer-events-none absolute inset-0 grid place-items-center">
      <div class="text-center">
        <div class="text-sm font-medium text-neutral-200">Map loading…</div>
        <div class="mt-1 text-xs text-neutral-500">
          Next: GeoJSON counties + hover/click drilldowns
        </div>
      </div>
    </div>

    <!-- Subtle grid overlay -->
    <div
      class="pointer-events-none absolute inset-0 opacity-20"
      style="
        background-image:
          linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px);
        background-size: 48px 48px;
      "
    ></div>
  </div>
</section>
