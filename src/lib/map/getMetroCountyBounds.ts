import { metroCountyGeoids } from "./countyStyles";

export interface MetroCountyBounds {
  sw: [number, number];
  ne: [number, number];
}

/**
 * Computes bounding box for metro counties from GeoJSON.
 * Returns southwest and northeast corners for use in fitBounds.
 */
export function getMetroCountyBounds(geojson: any): MetroCountyBounds | null {
  if (!geojson || !geojson.features || !geojson.features.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBoundsFromCoords(coords: any) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0];
      const y = coords[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const c of coords) updateBoundsFromCoords(c);
  }

  for (const f of geojson.features) {
    const props = f.properties || {};
    const geoid = props.GEOID || props.geoid || props.GEOIDFQ || props.GEOID_FQ;
    if (!geoid || !metroCountyGeoids.includes(String(geoid))) continue;
    const geom = f.geometry;
    if (!geom) continue;
    updateBoundsFromCoords(geom.coordinates);
  }

  if (minX === Infinity) return null;
  const pad = 0.02; // ~ a couple km depending on lat
  const sw: [number, number] = [minX - pad, minY - pad];
  const ne: [number, number] = [maxX + pad, maxY + pad];
  return { sw, ne };
}
