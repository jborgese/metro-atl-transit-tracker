// src/lib/map/addGeoJsonLayer.ts
import type { Map } from 'maplibre-gl'
import { createLogger } from '../../utils/logger'

const log = createLogger('MapLayer')

export function addGeoJsonLayer(
  map: Map,
  id: string,
  url: string,
  options?: {
    fillColor?: any
    fillOpacity?: number
    outlineColor?: string
  }
) {
  log.info(`layer:add:${id}`)

  map.addSource(id, {
    type: 'geojson',
    data: url,
  })

  map.addLayer({
    id: `${id}-fill`,
    type: 'fill',
    source: id,
    paint: {
      'fill-color': options?.fillColor ?? '#3b82f6',
      'fill-opacity': options?.fillOpacity ?? 0.25,
    },
  })

  map.addLayer({
    id: `${id}-outline`,
    type: 'line',
    source: id,
    paint: {
      'line-color': options?.outlineColor ?? '#1e40af',
      'line-width': 1,
    },
  })
}
