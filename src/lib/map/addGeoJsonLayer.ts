// src/lib/map/addGeoJsonLayer.ts
import type { Map } from 'maplibre-gl'
import { createLogger } from '../../utils/logger'

const log = createLogger('MapLayer')

export interface AddGeoJsonLayerOptions {
  fillColor?: string | any
  fillOpacity?: number
  outlineColor?: string
  /** Insert layer before this layer id (useful to place below labels) */
  beforeId?: string
  /** If true, generate numeric feature ids for feature-state usage */
  generateId?: boolean
}

export function addGeoJsonLayer(
  map: Map,
  id: string,
  url: string,
  options?: AddGeoJsonLayerOptions
) {
  log.info(`layer:add:${id}`)

  map.addSource(id, {
    type: 'geojson',
    data: url,
    generateId: options?.generateId ?? false,
  })

  const fillLayer = {
    id: `${id}-fill`,
    type: 'fill',
    source: id,
    paint: {
      'fill-color': options?.fillColor ?? '#3b82f6',
      'fill-opacity': options?.fillOpacity ?? 0.25,
    },
  }

  // Add fill; allow explicit placement before a label layer
  map.addLayer(fillLayer as any, options?.beforeId)

  const outlineLayer = {
    id: `${id}-outline`,
    type: 'line',
    source: id,
    paint: {
      'line-color': options?.outlineColor ?? '#1e40af',
      'line-width': 1,
    },
  }

  // Keep outline above the fill (no beforeId) for clear borders
  map.addLayer(outlineLayer as any)
}
