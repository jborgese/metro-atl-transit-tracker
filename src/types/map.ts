// src/types/map.ts
// Shared TypeScript types for map utilities (centralized)
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export interface AddGeoJsonLayerOptions {
  fillColor?: string | any
  fillOpacity?: number
  outlineColor?: string
  /** Color used when a feature is hovered (feature-state hover === true) */
  hoverFillColor?: string
  hoverOutlineColor?: string
  /** Insert layer before this layer id (useful to place below labels) */
  beforeId?: string
  /** If true, generate numeric feature ids for feature-state usage */
  generateId?: boolean
}

export interface CountyProperties {
  STATEFP?: string
  COUNTYFP?: string
  COUNTYNS?: string
  GEOID?: string
  GEOIDFQ?: string
  NAME?: string
  NAMELSAD?: string
  LSAD?: string
  CLASSFP?: string
  MTFCC?: string
  [key: string]: any
}

export type CountyFeature = Feature<Geometry, CountyProperties>
export type CountyGeoJSON = FeatureCollection<Geometry, CountyProperties>

export type GeoJSONFeature = Feature<Geometry, any>
export type GeoJSONCollection = FeatureCollection<Geometry, any>
