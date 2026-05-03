import maplibregl, { type StyleSpecification } from "maplibre-gl";

export interface InitMetroMapOptions {
  container: HTMLDivElement;
  style: string | StyleSpecification;
  center?: [number, number];
  zoom?: number;
  attributionControl?: boolean;
  customAttribution?: string | string[];
  onLoad?: (map: maplibregl.Map) => void;
  onError?: (error: any) => void;
}

/**
 * Initializes a MapLibre map for Metro Atlanta.
 * Adds controls, attribution, and attaches load/error listeners.
 */
export function initMetroMap({
  container,
  style,
  center = [-84.388, 33.749], // Atlanta, GA
  zoom = 9,
  attributionControl = false,
  customAttribution = ["County boundaries (c) US Census Bureau (TIGER/Line)"],
  onLoad,
  onError,
}: InitMetroMapOptions): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style,
    center,
    zoom,
    attributionControl: attributionControl ? {} : false,
  });

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution,
    }),
    "bottom-right"
  );

  const closeAttribution = () => {
    const el = container.querySelector(".maplibregl-ctrl-attrib");
    if (el) {
      el.classList.remove("maplibregl-compact-show");
      el.removeAttribute("open");
    }
  };
  closeAttribution();
  map.on("load", closeAttribution);

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  if (onLoad) {
    map.on("load", () => onLoad(map));
  }
  if (onError) {
    map.on("error", onError);
  }

  return map;
}
