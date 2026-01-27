<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";

  // ✅ update this import path to your global helper
  import { createLogger } from "../../utils/logger"; // <-- adjust

  const log = createLogger("MetroMap"); // should no-op in prod if your helper is gated

  export let title = "Metro Atlanta map";
  export let subtitle =
    "Interactive county/region map will load here (MapLibre next).";
  export let height = "520px";

  let mapEl: HTMLDivElement | null = null;
  let map: maplibregl.Map | null = null;
  let ro: ResizeObserver | null = null;

  function destroyMap(reason: string) {
    log.info("map:destroy", { reason });
    try {
      map?.remove();
    } catch (e) {
      log.warn("map:destroy-failed", e);
    } finally {
      map = null;
    }
  }

  function safeResize() {
    if (!map || !mapEl) return;
    const r = mapEl.getBoundingClientRect();
    log.debug("map:resize-check", { w: r.width, h: r.height });
    if (r.width > 0 && r.height > 0) {
      map.resize();
      log.debug("map:resized");
    } else {
      log.warn("container-size-zero", r);
    }
  }

  onMount(() => {
    log.info("mount:start");

    let cancelled = false;

    (async () => {
      // allow Astro/Svelte to paint + layout
      await tick();
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      const rect = mapEl?.getBoundingClientRect();
      log.debug("container:post-layout", rect);

      // If still zero, we can still construct map (it loads),
      // but we MUST resize once we have real dimensions.
      try {
        if (!mapEl) {
          log.error("mapEl is null, cannot construct map");
          return;
        }
        map = new maplibregl.Map({
          container: mapEl,
          style: "https://demotiles.maplibre.org/style.json",

          // ✅ Atlanta, GA
          center: [-84.388, 33.749],
          zoom: 9,

          attributionControl: {}, // ✅ correct typing
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("load", () => {
          log.info("map:load (Atlanta)");
          safeResize();
        });

        map.on("error", (e) => {
          log.error("map:error", e);
        });

        // Watch size changes (fixes client:visible + responsive layout)
        ro = new ResizeObserver(() => safeResize());
        ro.observe(mapEl);

        log.info("map:constructed");
        safeResize();
      } catch (e) {
        log.error("map:construct-failed", e);
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      ro = null;
      destroyMap("unmount");
      log.info("mount:cleanup");
    };
  });
</script>

<section aria-label={title}>
  <!-- Tailwind can still style the card; sizing does NOT depend on it -->
  <div class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
    <header class="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-semibold tracking-tight text-neutral-100">
          {title}
        </h2>
        <p class="mt-1 text-sm text-neutral-400">{subtitle}</p>
      </div>

      <span
        class="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-500"
      >
        Island: Svelte
      </span>
    </header>

    <!-- ✅ MapLibre wrapper with explicit size -->
    <div
      class="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
      style={`height: ${height};`}
      aria-label="Metro Atlanta map"
    >
      <!-- ✅ MapLibre mounts here -->
      <div class="map-container" bind:this={mapEl}></div>
    </div>
  </div>
</section>
