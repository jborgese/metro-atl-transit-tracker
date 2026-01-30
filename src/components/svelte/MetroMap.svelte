<script lang="ts">
  import { loadCountyMetadata, loadProjectsMetadata } from "../../lib/map/metadataLoader";
  import { getMetroCountyBounds } from "../../lib/map/getMetroCountyBounds";
  import { onMount, tick } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { initMetroMap } from "../../lib/map/initMetroMap";

  import { createLogger } from "../../utils/logger"; // adjust if needed
  import { metroCountyGeoids } from "../../lib/map/countyStyles";
  import { addMetroCountyLayers } from "../../lib/map/addMetroCountyLayers";
  import ProjectFilters from './ProjectFilters.svelte';
  import MetroCountyPanel from './MetroCountyPanel.svelte';

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


  let panelEl: HTMLElement | null = null;
  let closeBtn: HTMLButtonElement | null = null;

  // Controls whether to show all related projects in the panel
  let showAllProjects = false;

  $: relatedProjects = selectedCounty && projectsMetadata && projectsMetadata.length
    ? projectsMetadata.filter(p => p.related_counties && p.related_counties.indexOf(String(selectedCounty.geoid)) !== -1)
    : [];

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
    selectedCounty = null;
    try { mapEl?.focus(); } catch (e) { /* ignore */ }
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

        const key = import.meta.env.PUBLIC_MAPTILER_KEY;
        if (!key) {
          log.error("maptiler:key-missing (set PUBLIC_MAPTILER_KEY)");
          return;
        }

        const styleUrl = `https://api.maptiler.com/maps/streets/style.json?key=${key}`;

        map = initMetroMap({
          container: mapEl,
          styleUrl,
          center: [-84.388, 33.749],
          zoom: 9,
          attributionControl: false,
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
              {
                const { projectsMetadata: pm, error: projectsError } = await loadProjectsMetadata();
                projectsMetadata = pm;
                if (projectsError) log.warn('projects:load-failed', projectsError);
                else log.info('projects:loaded', { count: pm.length });
              }
              mapInstance.on('click', 'ga-counties-fill', (e: any) => {
                try {
                  console.log('ga-counties-fill:click', e);
                  if (!e.features || !e.features.length) return;
                  const props = e.features[0].properties || {};
                  console.log('feature.props:', props);
                  const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
                  console.log('derived geoid:', geoid);
                  if (!geoid || !metroCountyGeoids.includes(String(geoid))) {
                    console.log('click: geoid missing or not metro:', geoid);
                    return;
                  }
                  const idKey = String(geoid);
                  selectedCounty = countyMetadataMap[idKey] ?? { geoid: idKey, name: props.NAME || props.name };
                  console.log('selectedCounty set ->', selectedCounty);
                } catch (err) {
                  console.error('county click handler error', err);
                }
              });
              mapInstance.on('click', (e) => {
                try {
                  const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['ga-counties-fill'] });
                  console.log('map:click features at point', features && features.length);
                  if (!features.length) {
                    selectedCounty = null;
                    return;
                  }
                  const metroHit = features.find((f: any) => {
                    const p = f.properties || {};
                    const g = (p.GEOID || p.geoid || p.GEOIDFQ || p.GEOID_FQ);
                    return g && metroCountyGeoids.includes(String(g));
                  });
                  console.log('map:click metroHit', !!metroHit);
                  if (!metroHit) selectedCounty = null;
                } catch (err) {
                  console.error('map:click handler error', err);
                }
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

  // Global handlers for Escape/outside click to close the panel; keep them mounted
  function handleGlobalKey(e: KeyboardEvent) {
    if (!selectedCounty) return;
    if (e.key === 'Escape') {
      closePanel();
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (!selectedCounty) return;
    if (!panelEl) return;
    const target = e.target as Node;
    if (!panelEl.contains(target)) {
      closePanel();
    }
  }

  onMount(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleGlobalKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleGlobalKey);
    };
  });

  $: if (selectedCounty) {
    // Focus the close button when the panel opens
    tick().then(() => closeBtn?.focus());
  }
</script>

<section aria-label={title}>
  <div class="relative rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
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
      <!-- Debug badge: visible during development to help diagnose click/filter state -->
      <div style="z-index:99999;" class="absolute top-4 right-4 rounded bg-black/80 text-white text-xs p-2 border border-neutral-700 shadow-lg">
        <div class="font-medium">Debug</div>
        <div>selected: {debugSelectedKey}</div>
        <div>available modes: {debugAvailableCount}</div>
        <div>related projects: {debugRelatedCount}</div>
      </div>
      {#if selectedCounty}
        <aside bind:this={panelEl} class="map-panel-wrapper absolute top-4 left-4 z-50">
          <button bind:this={closeBtn} aria-label="Close county panel" class="ml-2 text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 rounded absolute right-2 top-2" on:click={closePanel}>✕</button>
          <MetroCountyPanel county={selectedCounty} />
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

  /* Override global .county-panel fixed positioning when rendered inside this map wrapper.
     Use :global so the rule is emitted to the page and higher specificity to trump global.css. */
  /* Target the renamed inner panel class */
  :global(.relative .county-panel-content) {
    position: absolute !important;
    top: 1rem !important;
    left: 1rem !important;
    bottom: auto !important;
    width: 18rem !important;
    max-height: calc(100% - 2rem) !important;
    overflow-y: auto !important;
    z-index: 10050 !important;
  }
</style>
