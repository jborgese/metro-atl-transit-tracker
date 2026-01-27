<script lang="ts">
  import { onMount } from 'svelte'
  import maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'

  export let title = 'Metro Atlanta map'
  export let subtitle =
    'Interactive county/region map will load here (MapLibre next).'
  export let height = '520px'

  let mapContainer: HTMLDivElement
  let map: maplibregl.Map | null = null

  onMount(() => {
    if (!mapContainer) return

    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://demotiles.maplibre.org/style.json',

      // ✅ Atlanta, GA (locked in)
      center: [-84.3880, 33.7490],
      zoom: 9
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', () => {
      console.log('MapLibre loaded (Atlanta)')
    })

    map.on('error', (e) => {
      console.error('MapLibre error:', e)
    })

    return () => {
      map?.remove()
      map = null
    }
  })
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
      <p class="mt-1 text-sm text-neutral-400">{subtitle}</p>
    </div>

    <span
      class="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-500"
    >
      Island: Svelte
    </span>
  </header>

  <!-- Map container (must be positioned + sized) -->
  <div
    class="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
    style={`height: ${height};`}
  >
    <div bind:this={mapContainer} class="absolute inset-0"></div>
  </div>
</section>
