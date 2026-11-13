<script lang="ts">
  import DebugBadge from './DebugBadge.svelte';
  import {
    handleCountySelection,
    handleMapClick,
    handlePanelClose,
    setupGlobalPanelListeners,
  } from '../../lib/map/countyPanelHandlers';
  import { loadCountyMetadata, loadProjectsMetadata } from '../../lib/map/metadataLoader';
  import { getMetroCountyBounds } from '../../lib/map/getMetroCountyBounds';
  import { onMount, tick } from 'svelte';
  import maplibregl, { type StyleSpecification } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { initMetroMap } from '../../lib/map/initMetroMap';
  import { PUBLIC_MAPTILER_KEY } from '$app/env/public';

  import { createLogger } from '../../utils/logger'; // adjust if needed
  import { metroCountyGeoids } from '../../lib/map/countyStyles';
  import { addMetroCountyLayers } from '../../lib/map/addMetroCountyLayers';
  import MetroCountyPanel from './MetroCountyPanel.svelte';
  import { orgLogos } from '../../data/static/orgLogos';

  const log = createLogger('MetroMap');

  // Set this to true to show the debug panel
  const showDebugPanel = false;

  let {
    title = 'Metro Atlanta map',
    height = 'clamp(18rem, 45vh, 34rem)',
    desktopHeight = 'clamp(22rem, 58vh, 44rem)',
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
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0b1d23' },
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
  let mapUnavailable = $state(false);

  // derived related projects for the selected county
  // Use precomputed lookup to avoid scanning the full projects array on each selection
  const relatedProjects = $derived(
    selectedCounty && projectsByCounty ? projectsByCounty[String(selectedCounty.geoid)] || [] : [],
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
      : [],
  );

  const debugAvailableCount = $derived(availableModes ? availableModes.length : 0);
  const debugRelatedCount = $derived(relatedProjects ? relatedProjects.length : 0);
  const debugSelectedKey = $derived(
    selectedCounty ? (selectedCounty.geoid ?? selectedCounty.name ?? 'unknown') : 'none',
  );

  function closePanel() {
    handlePanelClose({ mapEl, setSelectedCounty: (val) => (selectedCounty = val) });
  }

  function destroyMap(reason: string) {
    log.info('map:destroy', { reason });
    try {
      map?.remove();
    } catch (e) {
      log.warn('map:destroy-failed', e);
    } finally {
      map = null;
    }
  }

  function safeResize() {
    if (!map || !mapEl) return;
    const r = mapEl.getBoundingClientRect();
    log.debug('map:resize-check', { w: r.width, h: r.height });
    if (r.width > 0 && r.height > 0) {
      map.resize();
      log.debug('map:resized');
    } else {
      log.warn('container-size-zero', r);
    }
  }

  function selectCenteredCounty() {
    if (!map) return;
    handleCountySelection({
      feature: (map as any).__countyKeyboardActivate?.(),
      countyMetadataMap,
      metroCountyGeoids,
      setSelectedCounty: (val) => {
        selectedCounty = val;
      },
    });
  }

  onMount(() => {
    log.info('mount:start');

    let cancelled = false;

    (async () => {
      await tick();
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      log.debug('container:post-layout', mapEl?.getBoundingClientRect());

      try {
        if (!mapEl) {
          log.error('mapEl is null, cannot construct map');
          return;
        }

        const key = PUBLIC_MAPTILER_KEY?.trim();
        const hasMaptilerKey = Boolean(key);
        const style = hasMaptilerKey
          ? `https://api.maptiler.com/maps/streets/style.json?key=${key}`
          : fallbackStyle;
        if (!hasMaptilerKey) {
          log.warn('maptiler:key-missing; using fallback style');
        }

        map = initMetroMap({
          container: mapEl,
          style,
          center: [-84.388, 33.749],
          zoom: 9,
          attributionControl: false,
          customAttribution: hasMaptilerKey
            ? ['Map tiles (c) MapTiler', 'County boundaries (c) US Census Bureau (TIGER/Line)']
            : ['County boundaries (c) US Census Bureau (TIGER/Line)'],
          onLoad: async (mapInstance) => {
            log.info('map:load (Atlanta)');
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
                    mapInstance.fitBounds([bounds.sw, bounds.ne], {
                      padding: 80,
                      maxZoom: 12,
                      duration: 1000,
                    });
                    log.info('map:fitBounds:metro-counties', bounds);
                  } catch (e) {
                    log.warn('map:fitBounds-failed', e);
                  }
                } catch (e) {
                  log.warn('metro-bounds-calc-failed', e);
                }
              })();
              {
                const {
                  countyMetadata: cm,
                  countyMetadataMap: cmm,
                  error: countyError,
                } = await loadCountyMetadata();
                countyMetadataMap = cmm;
                if (countyError) log.warn('metadata:load-failed', countyError);
                else log.info('metadata:loaded', { count: cm.length });
              }
              // Projects metadata is loaded lazily (on first county selection or after idle)
              mapInstance.on('click', 'ga-counties-fill', (e: any) => {
                handleCountySelection({
                  feature: e.features?.[0],
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
              log.error('counties:add-layers-failed', e);
            }
          },
          onError: (e) => {
            log.error('map:error', e);
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

        log.info('map:constructed');
        safeResize();
      } catch (e) {
        log.error('map:construct-failed', e);
        mapUnavailable = true;
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      ro = null;
      if (map) {
        try {
          (map as any).__countyKeyboardActivate = undefined;
        } catch {
          /* ignore */
        }
      }
      destroyMap('unmount');
      log.info('mount:cleanup');
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
      if (!document.head.querySelector(`link[rel="preload"][href="${h}"]`)) {
        try {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = h;
          document.head.appendChild(link);
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
</script>

<section aria-label={title}>
  <div>
    <div
      class="map-frame"
      style={`--map-height: ${height}; --map-height-desktop: ${desktopHeight};`}
      aria-label="Metro Atlanta map"
    >
      <!-- MapLibre mounts here; .map-container MUST be 100%/100%.
           MapLibre's own canvas handles keyboard pan/zoom (arrows, +/-) and
           is exposed to assistive tech without a role="application" wrapper. -->
      <div class="map-container" bind:this={mapEl}>
        {#if !mapUnavailable}
          <button type="button" class="select-center-button" onclick={selectCenteredCounty}>
            Select county at map center
          </button>
        {/if}
        {#if showDebugPanel}
          <DebugBadge
            selectedCountyKey={debugSelectedKey}
            availableModesCount={debugAvailableCount}
            relatedProjectsCount={debugRelatedCount}
          />
        {/if}
        {#if selectedCounty}
          <aside bind:this={panelEl} class="map-panel-wrapper">
            <button
              bind:this={closeBtn}
              class="panel-close"
              aria-label="Close county panel"
              onclick={closePanel}>&times;</button
            >
            <MetroCountyPanel county={selectedCounty} />
          </aside>
        {/if}
      </div>
      {#if mapUnavailable}
        <p class="map-unavailable" role="status">
          <span>
            The interactive map couldn't start in this browser. Try another browser or turn on
            hardware acceleration; the county goals below still work.
          </span>
        </p>
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

  .map-frame {
    position: relative;
    height: var(--map-height);
  }

  .map-unavailable {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1.5rem;
    text-align: center;
    background: var(--surface-1);
    color: var(--text-muted);
  }

  .map-unavailable span {
    max-width: var(--content-narrow);
  }

  .select-center-button {
    position: absolute;
    top: 10px;
    right: calc(10px + 29px + 10px);
    z-index: var(--z-map-control);
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.375rem;
    background: var(--surface-2);
    color: var(--text-on-dark);
    font-size: 0.75rem;
    line-height: 1.2;
    cursor: pointer;
  }

  .select-center-button:hover {
    border-color: var(--border-strong);
  }

  .select-center-button:focus-visible {
    outline: 2px solid var(--atl-blue);
    outline-offset: 2px;
  }

  .panel-close {
    position: absolute;
    top: calc(1rem + 0.25rem);
    left: calc(1rem + 16rem - 2rem - 0.25rem);
    z-index: calc(var(--z-map-county-panel) + 1);
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.375rem;
    line-height: 1;
    cursor: pointer;
  }

  .panel-close:hover {
    color: var(--text-on-dark);
  }

  .panel-close:focus-visible {
    outline: 2px solid var(--atl-blue);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .panel-close {
      top: calc(0.5rem + 0.25rem);
      left: calc(0.5rem + min(20rem, 90vw) - 2rem - 0.25rem);
    }
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
