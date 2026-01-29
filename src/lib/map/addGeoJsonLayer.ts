// src/lib/map/addGeoJsonLayer.ts
import type { Map } from 'maplibre-gl'
import { createLogger } from '../../utils/logger'
import type { AddGeoJsonLayerOptions } from '@/types'

const log = createLogger('MapLayer')

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
      // highlight using feature-state 'hover', fall back to provided fillColor expression or a default
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        options?.hoverFillColor ?? '#f59e0b',
        options?.fillColor ?? '#3b82f6',
      ],
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
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        options?.hoverOutlineColor ?? '#ffffff',
        options?.outlineColor ?? '#1e40af',
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2,
        1,
      ],
    },
  }

  // Keep outline above the fill (no beforeId) for clear borders
  map.addLayer(outlineLayer as any)
}
