<script lang="ts">
  import DebugBadge from './DebugBadge.svelte';
  import {
    handleCountySelection,
    handleMapClick,
    handlePanelClose,
    setupGlobalPanelListeners,
  } from "../../lib/map/countyPanelHandlers";
  import { loadCountyMetadata, loadProjectsMetadata } from "../../lib/map/metadataLoader";
  import { getMetroCountyBounds } from "../../lib/map/getMetroCountyBounds";
  import { onMount, tick } from "svelte";
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

  // Set this to true to show the debug panel
  const showDebugPanel = false;

  let {
    title = "Metro Atlanta map",
    height = "clamp(18rem, 45vh, 34rem)",
    desktopHeight = "clamp(22rem, 58vh, 44rem)",
    oncountySelected,
  }: {
    title?: string;
    height?: string;
    desktopHeight?: string;
    oncountySelected?: (detail: { geoid: string | null }) => void;
  } = $props();

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
  // County metadata lookup (loaded from public/data/geo/counties-metadata.json)
  let countyMetadataMap: Record<string, any> = {};
  let selectedCounty: any = $state(null);
  let projectsMetadata: any[] = $state([]);
  // memoized map from county geoid -> projects list for fast lookup
  let projectsByCounty: Record<string, any[]> = $state({});
  // lazy-load state for projects metadata
  let projectsLoaded = $state(false);
  let projectsLoading = $state(false);

  let panelEl: HTMLElement | null = $state(null);
  let closeBtn: HTMLButtonElement | null = $state(null);

  // derived related projects for the selected county
  // Use precomputed lookup to avoid scanning the full projects array on each selection
  const relatedProjects = $derived(
    selectedCounty && projectsByCounty
      ? (projectsByCounty[String(selectedCounty.geoid)] || [])
      : []
  );

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
      const next: Record<string, any[]> = {};
      if (projectsMetadata && projectsMetadata.length) {
        for (const proj of projectsMetadata) {
          const rc = proj.related_counties;
          if (!rc || !Array.isArray(rc)) continue;
          for (const g of rc) {
            const key = String(g);
            if (!next[key]) next[key] = [];
            next[key].push(proj);
          }
        }
      }
      projectsByCounty = next;
      projectsLoaded = true;
    } catch (e) {
      log.warn('projects:load-error', e);
    } finally {
      projectsLoading = false;
    }
  }

  // Trigger lazy load when a county is first selected
  $effect(() => {
    if (selectedCounty && !projectsLoaded && !projectsLoading) {
      fetchProjectsIfNeeded();
    }
  });

  // Emit event when selectedCounty changes (including deselection)
  $effect(() => {
    oncountySelected?.({ geoid: selectedCounty?.geoid ? String(selectedCounty.geoid) : null });
  });

  // Debug-panel inputs (panel itself is gated by showDebugPanel)
  const availableModes = $derived(
    projectsMetadata && projectsMetadata.length
      ? Array.from(new Set(projectsMetadata.flatMap((p: any) => p.modes || []))).sort()
      : []
  );

  const debugAvailableCount = $derived(availableModes ? availableModes.length : 0);
  const debugRelatedCount = $derived(relatedProjects ? relatedProjects.length : 0);
  const debugSelectedKey = $derived(
    selectedCounty ? (selectedCounty.geoid ?? selectedCounty.name ?? 'unknown') : 'none'
  );

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

  function selectCenteredCounty() {
    if (!map) return;
    (map as any).__countyKeyboardActivate?.();
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
        } catch {
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
        try { (map as any).__countyKeyboardActivate = undefined } catch { /* ignore */ }
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

  export function clearSelection() {
    selectedCounty = null;
  }

  $effect(() => {
    if (selectedCounty) {
      // Focus the close button when the panel opens
      tick().then(() => closeBtn?.focus());
      // Preload any logos referenced by the county to avoid delayed image paints
      try {
        preloadLogosForCounty(selectedCounty);
      } catch {
        /* ignore */
      }
    }
  });

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
      class="map-frame relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
      style={`--map-height: ${height}; --map-height-desktop: ${desktopHeight};`}
      aria-label="Metro Atlanta map"
    >
      <!-- MapLibre mounts here; .map-container MUST be 100%/100%.
           MapLibre's own canvas handles keyboard pan/zoom (arrows, +/-) and
           is exposed to assistive tech without a role="application" wrapper. -->
      <div class="map-container" bind:this={mapEl}>
        <button
          type="button"
          class="select-center-button absolute top-2 right-2 z-40 rounded bg-neutral-900/80 px-3 py-2 text-xs text-neutral-100 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onclick={selectCenteredCounty}
        >
          Select county at map center
        </button>
        {#if showDebugPanel}
          <DebugBadge
            selectedCountyKey={debugSelectedKey}
            availableModesCount={debugAvailableCount}
            relatedProjectsCount={debugRelatedCount}
          />
        {/if}
        {#if selectedCounty}
          <aside bind:this={panelEl} class="map-panel-wrapper absolute top-4 left-4 z-50">
            <button bind:this={closeBtn} aria-label="Close county panel" class="text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 rounded absolute right-2 top-2 w-8 h-8 flex items-center justify-center text-xl leading-none" onclick={closePanel}>&times;</button>
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

  .map-frame {
    height: var(--map-height);
  }

  @media (min-width: 1024px) {
    .map-frame {
      height: var(--map-height-desktop);
    }
  }

  /* Landscape phones and other short viewports: don't let the map eat the whole screen */
  @media (max-height: 500px) {
    .map-frame {
      height: clamp(12rem, 65vh, 20rem);
    }
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
