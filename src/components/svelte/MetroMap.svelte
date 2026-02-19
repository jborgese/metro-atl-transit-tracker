<script lang="ts">
  import DebugBadge from './DebugBadge.svelte';
  // Set this to true to show the debug panel
  let showDebugPanel = false;
  import {
    handleCountySelection,
    handleMapClick,
    handlePanelClose,
    setupGlobalPanelListeners,
  } from "../../lib/map/countyPanelHandlers";
  import { loadCountyMetadata, loadProjectsMetadata } from "../../lib/map/metadataLoader";
  import { getMetroCountyBounds } from "../../lib/map/getMetroCountyBounds";
  import { onMount, tick, createEventDispatcher } from "svelte";
    // Svelte event dispatcher for parent communication
    const dispatch = createEventDispatcher();
  import maplibregl, { type StyleSpecification } from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { initMetroMap } from "../../lib/map/initMetroMap";
  import { env } from '$env/dynamic/public';

  import { createLogger } from "../../utils/logger"; // adjust if needed
  import { metroCountyGeoids } from "../../lib/map/countyStyles";
  import { addMetroCountyLayers } from "../../lib/map/addMetroCountyLayers";
  import MetroCountyPanel from './MetroCountyPanel.svelte';
  import { orgLogos } from '../../data/static/orgLogos';

  const log = createLogger("MetroMap");

  export let title = "Metro Atlanta map";
  export const subtitle =
    "Interactive county/region map will load here (MapLibre next).";
  export let height = "clamp(18rem, 45vh, 34rem)";

  const fallbackStyle: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0b1d23" },
      },
    ],
  };

  // IMPORTANT: this element is the MapLibre container
  let mapEl: HTMLDivElement | null = null;
  let map: maplibregl.Map | null = null;
  let ro: ResizeObserver | null = null;
  // County metadata (loaded from public/data/geo/counties-metadata.json)
  let countyMetadata: any[] = [];
  let countyMetadataMap: Record<string, any> = {};
  let selectedCounty: any = null;
  let projectsMetadata: any[] = [];
  // memoized map from county geoid -> projects list for fast lookup
  let projectsByCounty: Record<string, any[]> = {};
  // lazy-load state for projects metadata
  let projectsLoaded = false;
  let projectsLoading = false;
  // derived related projects for the selected county
  let relatedProjects: any[] = [];


  let panelEl: HTMLElement | null = null;
  let closeBtn: HTMLButtonElement | null = null;

  // Controls whether to show all related projects in the panel
  let showAllProjects = false;

  // Use precomputed lookup to avoid scanning the full projects array on each selection
  $: relatedProjects = selectedCounty && projectsByCounty
    ? (projectsByCounty[String(selectedCounty.geoid)] || [])
    : [];

  // Fetch projects metadata once (lazy). Called on first county selection or scheduled idle.
  async function fetchProjectsIfNeeded({ background = false } = {}) {
    if (projectsLoaded || projectsLoading) return;
    projectsLoading = true;
    try {
      const { projectsMetadata: pm, error: projectsError } = await loadProjectsMetadata();
      projectsMetadata = pm || [];
      if (projectsError) log.warn('projects:load-failed', projectsError);
      else log.info('projects:loaded', { count: projectsMetadata.length, background });

      // Build lookup
      projectsByCounty = {};
      if (projectsMetadata && projectsMetadata.length) {
        for (const proj of projectsMetadata) {
          const rc = proj.related_counties;
          if (!rc || !Array.isArray(rc)) continue;
          for (const g of rc) {
            const key = String(g);
            if (!projectsByCounty[key]) projectsByCounty[key] = [];
            projectsByCounty[key].push(proj);
          }
        }
      }
      projectsLoaded = true;
    } catch (e) {
      log.warn('projects:load-error', e);
    } finally {
      projectsLoading = false;
    }
  }

  // Trigger lazy load when a county is first selected
  $: if (selectedCounty && !projectsLoaded && !projectsLoading) {
    fetchProjectsIfNeeded();
  }

  // Emit event when selectedCounty changes (including deselection)
  $: dispatch('countySelected', { geoid: selectedCounty?.geoid ? String(selectedCounty.geoid) : null });

  // UI: available project modes and currently selected modes for filtering
  let availableModes: string[] = [];
  let selectedModes: string[] = [];
  // filtered list derived from relatedProjects + selectedModes
  let relatedProjectsFiltered: any[] = [];

  $: debugAvailableCount = availableModes ? availableModes.length : 0;
  $: debugRelatedCount = relatedProjects ? relatedProjects.length : 0;
  $: debugSelectedKey = selectedCounty ? (selectedCounty.geoid ?? selectedCounty.name ?? 'unknown') : 'none';

  $: availableModes = projectsMetadata && projectsMetadata.length
    ? Array.from(new Set(projectsMetadata.flatMap((p: any) => p.modes || []))).sort()
    : [];

  $: relatedProjectsFiltered = selectedModes && selectedModes.length
    ? relatedProjects.filter((p: any) => (p.modes || []).some((m: string) => selectedModes.indexOf(m) !== -1))
    : relatedProjects;


  function closePanel() {
    handlePanelClose({ mapEl, setSelectedCounty: (val) => (selectedCounty = val) });
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

        const key = env.PUBLIC_MAPTILER_KEY?.trim();
        const hasMaptilerKey = Boolean(key);
        const style = hasMaptilerKey
          ? `https://api.maptiler.com/maps/streets/style.json?key=${key}`
          : fallbackStyle;
        if (!hasMaptilerKey) {
          log.warn("maptiler:key-missing; using fallback style");
        }

        map = initMetroMap({
          container: mapEl,
          style,
          center: [-84.388, 33.749],
          zoom: 9,
          attributionControl: false,
          customAttribution: hasMaptilerKey
            ? [
                "Map tiles (c) MapTiler",
                "County boundaries (c) US Census Bureau (TIGER/Line)",
              ]
            : ["County boundaries (c) US Census Bureau (TIGER/Line)"],
          onLoad: async (mapInstance) => {
            log.info("map:load (Atlanta)");
            safeResize();
            try {
              addMetroCountyLayers({ map: mapInstance, mapEl, log });
              // ...existing code for fitBounds, metadata loading, and event listeners...
              (async () => {
                try {
                  const countiesUrl = '/data/geo/ga_counties.geojson';
                  const res = await fetch(countiesUrl);
                  if (!res.ok) throw new Error(`counties fetch ${res.status}`);
                  const gj = await res.json();
                  const bounds = getMetroCountyBounds(gj);
                  if (!bounds) {
                    log.warn('fitBounds: no metro features found');
                    return;
                  }
                  try {
                    mapInstance.fitBounds([bounds.sw, bounds.ne], { padding: 80, maxZoom: 12, duration: 1000 });
                    log.info('map:fitBounds:metro-counties', bounds);
                  } catch (e) {
                    log.warn('map:fitBounds-failed', e);
                  }
                } catch (e) {
                  log.warn('metro-bounds-calc-failed', e);
                }
              })();
              {
                const { countyMetadata: cm, countyMetadataMap: cmm, error: countyError } = await loadCountyMetadata();
                countyMetadata = cm;
                countyMetadataMap = cmm;
                if (countyError) log.warn('metadata:load-failed', countyError);
                else log.info('metadata:loaded', { count: cm.length });
              }
              // Projects metadata is loaded lazily (on first county selection or after idle)
              mapInstance.on('click', 'ga-counties-fill', (e: any) => {
                handleCountySelection({
                  event: e,
                  countyMetadataMap,
                  metroCountyGeoids,
                  setSelectedCounty: (val) => {
                    selectedCounty = val;
                  },
                });
              });
              mapInstance.on('click', (e) => {
                handleMapClick({
                  event: e,
                  mapInstance,
                  metroCountyGeoids,
                  setSelectedCounty: (val) => {
                    selectedCounty = val;
                  },
                });
              });
            } catch (e) {
              log.error("counties:add-layers-failed", e);
            }
          },
          onError: (e) => {
            log.error("map:error", e);
          },
        });

        ro = new ResizeObserver(() => safeResize());
        ro.observe(mapEl);

        // Schedule an idle/background fetch of projects after map is constructed
        try {
          if (typeof window !== 'undefined') {
            const doIdle = () => fetchProjectsIfNeeded({ background: true });
            if ('requestIdleCallback' in window) {
              (window as any).requestIdleCallback(doIdle, { timeout: 3000 });
            } else {
              setTimeout(doIdle, 3000);
            }
          }
        } catch (e) {
          /* ignore */
        }

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

  onMount(() => {
    // Use helper for global panel listeners
    const removeListeners = setupGlobalPanelListeners({
      selectedCounty: () => selectedCounty,
      panelEl,
      setSelectedCounty: (val) => (selectedCounty = val),
    });
    return removeListeners;
  });

  $: if (selectedCounty) {
    // Focus the close button when the panel opens
    tick().then(() => closeBtn?.focus());
    // Preload any logos referenced by the county to avoid delayed image paints
    try {
      preloadLogosForCounty(selectedCounty);
    } catch (e) {
      /* ignore */
    }
  }

  // Insert <link rel="preload" as="image"> tags for logos used by a county
  const _preloadedLogoHrefs = new Set<string>();
  function preloadLogosForCounty(county: any) {
    if (!county) return;
    const hrefs: string[] = [];
    const collect = (name: string | undefined) => {
      if (!name) return;
      const url = orgLogos[name];
      if (url) hrefs.push(url);
    };
    if (county.primary_transit_agencies && Array.isArray(county.primary_transit_agencies)) {
      for (const a of county.primary_transit_agencies) collect(a.name);
    }
    if (county.governance && county.governance.groups && Array.isArray(county.governance.groups)) {
      for (const g of county.governance.groups) collect(g.name);
    }
    if (county.advocacy && county.advocacy.groups && Array.isArray(county.advocacy.groups)) {
      for (const g of county.advocacy.groups) collect(g.name);
    }
    for (const h of hrefs) {
      if (!_preloadedLogoHrefs.has(h)) {
        try {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = h;
          document.head.appendChild(link);
          _preloadedLogoHrefs.add(h);
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
</script>

<section aria-label={title}>
  <div class="relative rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
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
      >
        <p id="map-instructions" class="sr-only">
          Focus the map and press Enter to highlight the county at the center of the map.
        </p>
        {#if showDebugPanel}
          <DebugBadge
            selectedCountyKey={debugSelectedKey}
            availableModesCount={debugAvailableCount}
            relatedProjectsCount={debugRelatedCount}
          />
        {/if}
        {#if selectedCounty}
          <aside bind:this={panelEl} class="map-panel-wrapper absolute top-4 left-4 z-50">
            <button bind:this={closeBtn} aria-label="Close county panel" class="ml-2 text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 rounded absolute right-2 top-2" on:click={closePanel}>&times;</button>
            <MetroCountyPanel county={selectedCounty} />
          </aside>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  /* Ensure the MapLibre container fills the wrapper */
  .map-container {
    width: 100%;
    height: 100%;
  }

  /* Constrain the floating county panel to the map height and allow scrolling
     when panel content is taller than the map container. Use box-sizing so
     padding doesn't grow the element beyond the available space. */
  .map-panel-wrapper {
    box-sizing: border-box;
    max-height: calc(100% - 1rem); /* leave a small gap from map edges */
    overflow: auto;
    padding-right: 0.25rem; /* room for scrollbar without covering content */
  }

  /* Ensure inner panel content doesn't force an overflow change; allow
     images and lists to wrap inside the scrollable container. */
  .map-panel-wrapper :global(.county-panel-content) {
    box-sizing: border-box;
    max-height: 100%;
  }
</style>
