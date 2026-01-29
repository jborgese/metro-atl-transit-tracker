<script lang="ts">
  import { onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";

  import { createLogger } from "../../utils/logger"; // adjust if needed
  import { addGeoJsonLayer } from "../../lib/map/addGeoJsonLayer";
  import { metroCountyColorMatch, metroCountyGeoids } from "../../lib/map/countyStyles";

  const log = createLogger("MetroMap");

  export let title = "Metro Atlanta map";
  export let subtitle =
    "Interactive county/region map will load here (MapLibre next).";
  export let height = "520px";

  // IMPORTANT: this element is the MapLibre container
  let mapEl: HTMLDivElement | null = null;
  let map: maplibregl.Map | null = null;
  let ro: ResizeObserver | null = null;
  // County metadata (loaded from public/data/geo/counties-metadata.json)
  let countyMetadata: any[] = [];
  let countyMetadataMap: Record<string, any> = {};
  let selectedCounty: any = null;
  let projectsMetadata: any[] = [];
  // derived related projects for the selected county
  let relatedProjects: any[] = [];

  $: relatedProjects = selectedCounty && projectsMetadata && projectsMetadata.length
    ? projectsMetadata.filter(p => p.related_counties && p.related_counties.indexOf(String(selectedCounty.geoid)) !== -1)
    : [];

  async function loadProjectsMetadata() {
    try {
      const res = await fetch('/data/geo/projects-metadata.json');
      if (!res.ok) throw new Error(`projects fetch ${res.status}`);
      projectsMetadata = await res.json();
      log.info('projects:loaded', { count: projectsMetadata.length });
    } catch (e) {
      log.warn('projects:load-failed', e);
    }
  }

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

      // Only allow hover/cursor for metro counties
      const props = f.properties || {};
      const geoid = (props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ);
      if (!geoid || !metroCountyGeoids.includes(String(geoid))) {
        // If previously hovering a metro feature, clear it
        if (hoveredFeatureId !== undefined) {
          try { m.setFeatureState({ source: 'ga-counties', id: hoveredFeatureId }, { hover: false }); } catch {}
          hoveredFeatureId = undefined;
        }
        m.getCanvas().style.cursor = '';
        return;
      }

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
      const props = f.properties || {};
      const geoid = (props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ);
      if (!geoid || !metroCountyGeoids.includes(String(geoid))) return;
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

  async function loadCountyMetadata() {
    try {
      const res = await fetch('/data/geo/counties-metadata.json');
      if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
      countyMetadata = await res.json();
      countyMetadataMap = {};
      for (const c of countyMetadata) {
        if (c.geoid) countyMetadataMap[String(c.geoid)] = c;
      }
      log.info('metadata:loaded', { count: countyMetadata.length });
    } catch (e) {
      log.warn('metadata:load-failed', e);
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

        map.on("load", async () => {
          log.info("map:load (Atlanta)");
          safeResize();

          try {
            addGeorgiaCountiesLayers(map!);
            // load project/county metadata for popups/panels
            await loadCountyMetadata();
            await loadProjectsMetadata();

            // show selected county metadata on click
            map!.on('click', 'ga-counties-fill', (e: any) => {
              if (!e.features || !e.features.length) return;
              const props = e.features[0].properties || {};
              const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
              if (!geoid || !metroCountyGeoids.includes(String(geoid))) return;
              const idKey = String(geoid);
              selectedCounty = countyMetadataMap[idKey] ?? { geoid: idKey, name: props.NAME || props.name };
            });

            // allow clicking outside to clear selection
            map!.on('click', (e) => {
              const features = map!.queryRenderedFeatures(e.point, { layers: ['ga-counties-fill'] });
              if (!features.length) {
                selectedCounty = null;
                return;
              }
              // If there are features but none are metro counties, clear selection
              const metroHit = features.find((f: any) => {
                const p = f.properties || {};
                const g = (p.GEOID || p.geoid || p.GEOIDFQ || p.GEOID_FQ);
                return g && metroCountyGeoids.includes(String(g));
              });
              if (!metroHit) selectedCounty = null;
            });
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
      {#if selectedCounty}
        <aside class="absolute left-4 bottom-4 w-72 max-w-full rounded-md bg-neutral-900/90 border border-neutral-800 p-3 text-sm text-neutral-200">
          <div class="flex items-start justify-between">
            <div>
              <strong class="block text-sm">{selectedCounty.display_name ?? selectedCounty.name}</strong>
              <div class="text-xs text-neutral-400">GEOID: {selectedCounty.geoid}</div>
            </div>
            <button aria-label="Close county panel" class="ml-2 text-neutral-400" on:click={() => (selectedCounty = null)}>✕</button>
          </div>

          {#if selectedCounty.governance}
            <div class="mt-2 text-xs">
              <div class="font-medium">Governance</div>
              <div>{selectedCounty.governance.governing_body ?? selectedCounty.governance.governance_type}</div>
            </div>
          {/if}

          {#if selectedCounty.primary_transit_agencies && selectedCounty.primary_transit_agencies.length}
            <div class="mt-2 text-xs">
              <div class="font-medium">Transit agencies</div>
              <ul class="list-disc pl-4">
                {#each selectedCounty.primary_transit_agencies as a}
                  <li><a class="text-neutral-200 underline" href={a.contact_url} target="_blank" rel="noopener">{a.name}</a></li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if relatedProjects && relatedProjects.length}
            <div class="mt-3 text-xs">
              <div class="font-medium">Related projects & initiatives</div>
              <ul class="mt-1 space-y-2">
                {#each relatedProjects as pr}
                  <li>
                    <div class="font-medium text-sm">{pr.title}</div>
                    <div class="text-neutral-400 text-xs">{pr.summary}</div>
                    {#if pr.sources && pr.sources.length}
                      <div class="text-xs mt-1"><a class="underline text-neutral-200" href={pr.sources[0].url} target="_blank" rel="noopener">Source</a></div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </aside>
      {/if}
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
