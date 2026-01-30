
import type { Map as MaplibreMap } from "maplibre-gl";

interface CountySelectionParams {
  event: any;
  countyMetadataMap: Record<string, any>;
  metroCountyGeoids: string[];
  setSelectedCounty: (county: any) => void;
}

export function handleCountySelection({
  event,
  countyMetadataMap,
  metroCountyGeoids,
  setSelectedCounty,
}: CountySelectionParams): void {
  try {
    if (!event?.features?.length) return;
    const props = event.features[0].properties || {};
    const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
    if (!geoid || !metroCountyGeoids.includes(String(geoid))) return;
    const idKey = String(geoid);
    setSelectedCounty(countyMetadataMap[idKey] ?? { geoid: idKey, name: props.NAME || props.name });
  } catch (err) {
    console.error("handleCountySelection error:", err);
  }
}


interface MapClickParams {
  event: any;
  mapInstance: MaplibreMap;
  metroCountyGeoids: string[];
  setSelectedCounty: (county: any) => void;
}

export function handleMapClick({
  event,
  mapInstance,
  metroCountyGeoids,
  setSelectedCounty,
}: MapClickParams): void {
  try {
    const features = mapInstance.queryRenderedFeatures(event.point, { layers: ["ga-counties-fill"] });
    if (!features.length) {
      setSelectedCounty(null);
      return;
    }
    const metroHit = features.find((f: any) => {
      const p = f.properties || {};
      const g = p.GEOID || p.geoid || p.GEOIDFQ || p.GEOID_FQ;
      return g && metroCountyGeoids.includes(String(g));
    });
    if (!metroHit) setSelectedCounty(null);
  } catch (err) {
    console.error("handleMapClick error:", err);
  }
}


interface PanelCloseParams {
  mapEl: HTMLElement | null;
  setSelectedCounty: (county: any) => void;
}

export function handlePanelClose({ mapEl, setSelectedCounty }: PanelCloseParams): void {
  setSelectedCounty(null);
  try { mapEl?.focus(); } catch (err) { /* ignore */ }
}


interface GlobalPanelListenersParams {
  selectedCounty: () => any;
  panelEl: HTMLElement | null;
  setSelectedCounty: (county: any) => void;
}

export function setupGlobalPanelListeners({ selectedCounty, panelEl, setSelectedCounty }: GlobalPanelListenersParams): () => void {
  function handleGlobalKey(e: KeyboardEvent) {
    if (!selectedCounty()) return;
    if (e.key === "Escape") {
      setSelectedCounty(null);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (!selectedCounty()) return;
    if (!panelEl) return;
    const target = e.target as Node | null;
    if (target && !panelEl.contains(target)) {
      setSelectedCounty(null);
    }
  }

  document.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("keydown", handleGlobalKey);
  return () => {
    document.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("keydown", handleGlobalKey);
  };
}
