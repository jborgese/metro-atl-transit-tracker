import maplibregl from "maplibre-gl";

export interface InitMetroMapOptions {
  container: HTMLDivElement;
  styleUrl: string;
  center?: [number, number];
  zoom?: number;
  attributionControl?: boolean;
  onLoad?: (map: maplibregl.Map) => void;
  onError?: (error: any) => void;
}

/**
 * Initializes a MapLibre map for Metro Atlanta.
 * Adds controls, attribution, and attaches load/error listeners.
 */
export function initMetroMap({
  container,
  styleUrl,
  center = [-84.388, 33.749], // Atlanta, GA
  zoom = 9,
  attributionControl = false,
  onLoad,
  onError,
}: InitMetroMapOptions): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: styleUrl,
    center,
    zoom,
    attributionControl: false,
  });

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: [
        "Map tiles © MapTiler",
        "County boundaries © US Census Bureau (TIGER/Line)",
      ],
    }),
    "bottom-right"
  );

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  if (onLoad) {
    map.on("load", () => onLoad(map));
  }
  if (onError) {
    map.on("error", onError);
  }

  return map;
}
