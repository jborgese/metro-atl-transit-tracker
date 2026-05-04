import maplibregl from "maplibre-gl";
import { addGeoJsonLayer } from "./addGeoJsonLayer";
import { metroCountyColorMatch, metroCountyGeoids } from "./countyStyles";

export interface AddMetroCountyLayersOptions {
  map: maplibregl.Map;
  mapEl?: HTMLDivElement | null;
  log?: { info: Function; warn: Function };
}

/**
 * Adds Georgia counties GeoJSON source and layers to the map,
 * sets up fill/outline layers, and handles hover/cursor/keyboard activation.
 */
export function addMetroCountyLayers({ map, mapEl, log }: AddMetroCountyLayersOptions) {
  const countiesUrl = "/data/geo/ga_counties.geojson";
  const fillColor = metroCountyColorMatch;
  const labelLayerId = map.getStyle?.()?.layers?.find((l) => l.type === "symbol" && /label/i.test(l.id))?.id;
  const beforeId = labelLayerId ? labelLayerId : undefined;

  if (!map.getSource("ga-counties")) {
    const layerOpts: any = {
      fillColor,
      fillOpacity: 0.28,
      outlineColor: "#0f172a",
      generateId: true,
      hoverFillColor: "#f59e0b",
      hoverOutlineColor: "#ffffff",
    };
    if (beforeId) layerOpts.beforeId = beforeId;
    addGeoJsonLayer(map, "ga-counties", countiesUrl, layerOpts);
    log?.info?.("counties:source-added", { url: countiesUrl, beforeId: labelLayerId });
  } else {
    if (!map.getLayer("ga-counties-fill")) {
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
        map.addLayer(fillLayer, labelLayerId);
      } else {
        map.addLayer(fillLayer);
      }
      log?.info?.("counties:fill-layer-added");
    }
    if (!map.getLayer("ga-counties-outline")) {
      map.addLayer({
        id: "ga-counties-outline",
        type: "line",
        source: "ga-counties",
        paint: {
          "line-color": "#0f172a",
          "line-width": 1,
          "line-opacity": 0.8,
        },
      });
      log?.info?.("counties:outline-layer-added");
    }
  }

  // Hover / cursor handlers
  let hoveredFeatureId: string | number | undefined = undefined;

  function clearHover() {
    if (hoveredFeatureId === undefined) return;
    try { map.setFeatureState({ source: "ga-counties", id: hoveredFeatureId }, { hover: false }); } catch {}
    hoveredFeatureId = undefined;
  }

  function setHover(id: string | number) {
    if (hoveredFeatureId !== undefined && hoveredFeatureId !== id) clearHover();
    hoveredFeatureId = id;
    map.setFeatureState({ source: "ga-counties", id }, { hover: true });
  }

  function onMove(e: any) {
    if (!e.features || !e.features.length) return;
    const f = e.features[0];
    const props = f.properties || {};
    const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
    if (!geoid || !metroCountyGeoids.includes(String(geoid))) {
      clearHover();
      map.getCanvas().style.cursor = "";
      return;
    }
    setHover(f.id);
    map.getCanvas().style.cursor = "pointer";
  }

  function onLeave() {
    clearHover();
    map.getCanvas().style.cursor = "";
  }

  map.on("mousemove", "ga-counties-fill", onMove);
  map.on("mouseleave", "ga-counties-fill", onLeave);

  function keyboardActivate() {
    if (!mapEl) return;
    const rect = mapEl.getBoundingClientRect();
    const point = [rect.width / 2, rect.height / 2] as const;
    const features = map.queryRenderedFeatures(point as any, { layers: ["ga-counties-fill"] });
    const f = features[0];
    if (!f) return;
    const props = f.properties || {};
    const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
    if (!geoid || !metroCountyGeoids.includes(String(geoid))) return;
    if (f.id === undefined) return;
    setHover(f.id);
    setTimeout(() => { clearHover(); }, 2000);
  }

  (map as any).__countyKeyboardActivate = keyboardActivate;
}
