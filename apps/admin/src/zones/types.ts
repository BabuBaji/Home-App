// Shared zone types used by the onboarding wizard + zone/admin dashboards, so all views
// agree on one BZone/ZoneConfig shape (matches the backend catalog zones.config JSONB).
export type Apt = { id: string; name: string; type: string; cluster?: string; units?: number; pincode?: string; siteId?: number }
export type Person = { id: number; name: string }

export interface ZoneConfig {
  description?: string
  coverage?: { mode: 'radius' | 'pincodes'; radiusKm: number; lat: number; lng: number; pincodes: string[] }
  apartments?: Apt[]
  services?: string[]
  pricing?: Record<string, number>
  pricingExtras?: { gst: number; convenienceFee: number; minOrder: number; discount: number }
  capacity?: { maxOrders: number; workersRequired: number; minOnline: number; maxEtaMin: number; maxTravelKm: number }
  workingHours?: { is247: boolean; days: Record<string, { open: string; close: string; closed: boolean }> }
  holidays?: { date: string; name: string }[]
  team?: { manager?: Person; teamLeaders: Person[]; workers: Person[] }
  goLive?: { enableBookings: boolean; instant: boolean; scheduled: boolean; autoAssign: boolean }
}

export interface BZone {
  id: number; name: string; code?: string; state?: string; city?: string
  status: string; sla_minutes?: number; config: ZoneConfig; pincodeList?: string[]
}
