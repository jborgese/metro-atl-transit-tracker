<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";

  import { createLogger } from "../../utils/logger"; // adjust if needed
  import { addGeoJsonLayer } from "../../lib/map/addGeoJsonLayer";
  import { metroCountyColorMatch } from "../../lib/map/countyStyles";

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

  function handleKeyDown(e: KeyboardEvent) {
    if (!map) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      (map as any).__countyKeyboardActivate?.();
    }
  }

  function addGeorgiaCountiesLayers(m: maplibregl.Map) {
    // Update path if you placed it differently
    const countiesUrl = "/data/geo/ga_counties.geojson";

    // Use centralized GEOID-based color mapping
    const fillColor = metroCountyColorMatch;

    // Find a reasonable label layer to insert counties before (keep them below labels)
    const labelLayerId = m.getStyle?.()?.layers?.find((l) => l.type === "symbol" && /label/i.test(l.id))?.id;
    const beforeId = labelLayerId ? labelLayerId : undefined;

    // If the source doesn't exist yet, use the shared helper which also adds layers
    if (!m.getSource("ga-counties")) {
      const layerOpts: any = {
        fillColor,
        fillOpacity: 0.28,
        outlineColor: "#0f172a",
        generateId: true,
        hoverFillColor: '#f59e0b',
        hoverOutlineColor: '#ffffff',
      };
      if (beforeId) layerOpts.beforeId = beforeId;

      addGeoJsonLayer(m, "ga-counties", countiesUrl, layerOpts);
      log.info("counties:source-added", { url: countiesUrl, beforeId: labelLayerId });
    } else {
      // If source exists but layers are missing, add them (keeping previous behavior)
        if (!m.getLayer("ga-counties-fill")) {
        const fillLayer = {
            id: "ga-counties-fill",
            type: "fill",
            source: "ga-counties",
            paint: {
              "fill-opacity": 0.28,
              "fill-color": fillColor,
            },
          } as any;

        if (labelLayerId) {
          m.addLayer(fillLayer, labelLayerId);
        } else {
          m.addLayer(fillLayer);
        }
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

    // Hover / cursor handlers
    let hoveredFeatureId: string | number | undefined = undefined;

    function onMove(e: any) {
      if (!e.features || !e.features.length) return;
      const f = e.features[0];

      if (hoveredFeatureId !== undefined && hoveredFeatureId !== f.id) {
        try { m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: false }); } catch {}
      }

      hoveredFeatureId = f.id;
      m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: true });
      m.getCanvas().style.cursor = 'pointer';
    }

    function onLeave() {
      if (hoveredFeatureId !== undefined) {
        try { m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: false }); } catch {}
        hoveredFeatureId = undefined;
      }
      m.getCanvas().style.cursor = '';
    }

    m.on('mousemove', 'ga-counties-fill', onMove);
    m.on('mouseleave', 'ga-counties-fill', onLeave);

    function keyboardActivate() {
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      const point = [rect.width / 2, rect.height / 2] as const;
      const features = m.queryRenderedFeatures(point as any, { layers: ['ga-counties-fill'] });
      if (!features.length) return;
      const f = features[0];
      if (hoveredFeatureId !== undefined) {
        try { m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: false }); } catch {}
      }
      hoveredFeatureId = f.id;
      m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: true });
      setTimeout(() => {
        try { m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: false }); } catch {}
        hoveredFeatureId = undefined;
      }, 2000);
    }

    (m as any).__countyKeyboardActivate = keyboardActivate;
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
      if (map) {
        try { (map as any).__countyKeyboardActivate = undefined } catch (e) { /* ignore */ }
      }
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
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div
        class="map-container"
        bind:this={mapEl}
        tabindex="0"
        role="application"
        on:keydown={handleKeyDown}
        aria-describedby="map-instructions"
      ></div>

      <p id="map-instructions" class="sr-only">
        Focus the map and press Enter to highlight the county at the center of the map.
      </p>
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
