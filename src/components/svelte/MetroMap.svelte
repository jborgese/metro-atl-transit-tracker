<script lang="ts">
  export let height: string = "520px";
  export let title: string = "Metro Atlanta map";
  export let subtitle: string =
    "Interactive county/region map will load here (MapLibre next).";
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

  <div
    class="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
    style={`height:${height};`}
  >
    <!-- “Map” placeholder surface -->
    <div class="absolute inset-0 grid place-items-center">
      <div class="text-center">
        <div class="text-sm font-medium text-neutral-200">Map container</div>
        <div class="mt-1 text-xs text-neutral-500">
          Next: MapLibre + GeoJSON counties + hover/click drilldowns
        </div>
      </div>
    </div>

    <!-- subtle grid for visual polish -->
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
