// src/lib/map/initMap.ts
import maplibregl from 'maplibre-gl'
import { createLogger } from '../..//utils/logger'

const log = createLogger('MapInit')

export function initMap(container: HTMLElement, apiKey: string) {
  log.info('map:init')

  return new maplibregl.Map({
    container,
    style: `https://api.maptiler.com/maps/streets/style.json?key=${apiKey}`,
    center: [-84.388, 33.749], // Atlanta
    zoom: 9,
    attributionControl: false,
  })
}
