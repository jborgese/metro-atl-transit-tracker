// src/types/index.ts
// Barrel exports for centralized types
export * from './map'
export type Id = string

export type JurisdictionType = 'region' | 'county'

export interface Link {
  label: string
  url: string
}

export interface Agency {
  id: Id
  name: string
  type: 'agency' | 'advisory'
  counties: Id[]
  links: Link[]
}

export type StatusType = 'binary' | 'progress' | 'unknown'

export type BinaryStatus = 'supported' | 'blocked' | 'canceled' | 'achieved'

export interface StatusUpdate {
  date: string // ISO yyyy-mm-dd
  summary: string
  sources: Link[]
  media?: Link[]
}

export interface Goal {
  id: Id
  title: string
  description?: string
  counties: Id[]
  agencies: Id[]
  tags?: string[]

  statusType: StatusType
  binaryStatus?: BinaryStatus
  progressPercent?: number
  progressPhase?: string

  stakeholders?: string[]
  actionsNeeded?: string[]
  sources?: Link[]
  statusUpdates?: StatusUpdate[]
}

export interface Jurisdiction {
  id: Id
  name: string
  type: JurisdictionType
  agencies: Id[]
  goals: Id[]
}
