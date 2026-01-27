<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";

  import { createLogger } from "../../utils/logger"; // adjust if needed

  const log = createLogger("MetroMap");

  export let title = "Metro Atlanta map";
  export let subtitle =
    "Interactive county/region map will load here (MapLibre next).";
  export let height = "520px";

  // IMPORTANT: this element is the MapLibre container
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

  function addGeorgiaCountiesLayers(m: maplibregl.Map) {
    // Update path if you placed it differently
    const countiesUrl = "/data/geo/ga_counties.geojson";

    if (!m.getSource("ga-counties")) {
      m.addSource("ga-counties", {
        type: "geojson",
        data: countiesUrl,
      });
      log.info("counties:source-added", { url: countiesUrl });
    }

    // Put counties under labels but above basemap fills (MapTiler uses "label" layers near top)
    // If you want guaranteed placement, we can find a specific label layer id.
    if (!m.getLayer("ga-counties-fill")) {
      m.addLayer({
        id: "ga-counties-fill",
        type: "fill",
        source: "ga-counties",
        paint: {
          "fill-opacity": 0.28,
          // Start with a simple metro highlight set (adjust as needed)
          "fill-color": [
            "match",
            ["get", "NAME"],
            "Fulton", "#2563eb",
            "DeKalb", "#7c3aed",
            "Cobb", "#16a34a",
            "Gwinnett", "#f59e0b",
            "#334155", // default
          ],
        },
      });
      log.info("counties:fill-layer-added");
    }

    if (!m.getLayer("ga-counties-outline")) {
      m.addLayer({
        id: "ga-counties-outline",
        type: "line",
        source: "ga-counties",
        paint: {
          "line-color": "#0f172a",
          "line-width": 1,
          "line-opacity": 0.8,
        },
      });
      log.info("counties:outline-layer-added");
    }
  }

  onMount(() => {
    log.info("mount:start");

    let cancelled = false;

    (async () => {
      await tick();
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      log.debug("container:post-layout", mapEl?.getBoundingClientRect());

      try {
        if (!mapEl) {
          log.error("mapEl is null, cannot construct map");
          return;
        }

        const key = import.meta.env.PUBLIC_MAPTILER_KEY;
        if (!key) {
          log.error("maptiler:key-missing (set PUBLIC_MAPTILER_KEY)");
          return;
        }

        const styleUrl = `https://api.maptiler.com/maps/streets/style.json?key=${key}`;

        map = new maplibregl.Map({
          container: mapEl,
          style: styleUrl,
          center: [-84.388, 33.749], // Atlanta, GA
          zoom: 9,
          attributionControl: false, // ✅ correct for MapLibre types
        });

        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: [
              'Map tiles © MapTiler',
              'County boundaries © US Census Bureau (TIGER/Line)'
            ],
          }),
          'bottom-right'
        );

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("load", () => {
          log.info("map:load (Atlanta)");
          safeResize();

          try {
            addGeorgiaCountiesLayers(map!);
          } catch (e) {
            log.error("counties:add-layers-failed", e);
          }
        });

        map.on("error", (e) => {
          log.error("map:error", e);
        });

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

    <div
      class="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
      style={`height: ${height};`}
      aria-label="Metro Atlanta map"
    >
      <!-- MapLibre mounts here; .map-container MUST be 100%/100% -->
      <div class="map-container" bind:this={mapEl}></div>
    </div>
  </div>
</section>

<style>
  /* Ensure the MapLibre container fills the wrapper */
  .map-container {
    width: 100%;
    height: 100%;
  }
</style>
