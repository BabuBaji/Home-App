// Shared zone types used by the onboarding wizard + zone/admin dashboards, so all views
// agree on one BZone/ZoneConfig shape (matches the backend catalog zones.config JSONB).
export type Apt = { id: string; name: string; type: string; cluster?: string; units?: number; pincode?: string; siteId?: number }
export type Person = { id: number; name: string; phone?: string; email?: string; role?: string; avatar?: string | null }

export interface ZoneConfig {
  description?: string
  coverage?: { mode: 'radius' | 'pincodes'; radiusKm: number; lat: number; lng: number; pincodes: string[] }
  apartments?: Apt[]
  services?: string[]
  pricing?: Record<string, number>
  discounts?: Record<string, number>          // per-service discount % (0/undefined = none)
  customServices?: { id: string; name: string; price: number; durationMin?: number }[]
  addons?: { id: string; name: string; price: number; discount?: number }[]
  pricingExtras?: { gst: number; convenienceFee: number; minOrder: number; discount: number; includeGst?: boolean; useDefault?: boolean }
  // Peak-hour surcharge: a % uplift applied to bookings whose slot falls in any custom time window.
  peakHours?: { enabled: boolean; upliftPct: number; windows: { id: string; start: string; end: string }[] }
  capacity?: {
    maxOrders: number; workersRequired: number; minOnline: number; maxEtaMin: number; maxTravelKm: number
    // Capacity settings
    maxConcurrentPerWorker?: number; bufferWorkers?: number; utilizationTarget?: number
    // SLA / service level
    jobStartWindowMin?: number; jobCompletionSlaMin?: number; graceTimeMin?: number; cancellationThreshold?: number
  }
  zoneType?: 'Residential' | 'Commercial' | 'Industrial'
  workingHours?: {
    is247: boolean
    // Per day: open/close time, closed flag, and an optional daily break window (brStart–brEnd).
    days: Record<string, { open: string; close: string; closed: boolean; brStart?: string; brEnd?: string }>
    breakTime?: { enabled: boolean; start: string; end: string }   // legacy global break (kept for older zones)
    specialHours?: { id: string; label: string; open: string; close: string; date?: string }[]
  }
  holidays?: { date: string; name: string }[]
  team?: { manager?: Person; teamLeaders: Person[]; workers: Person[]; backupManager?: Person; supportContact?: Person }
  goLive?: { enableBookings: boolean; instant: boolean; scheduled: boolean; autoAssign: boolean }
}

export interface BZone {
  id: number; name: string; code?: string; state?: string; city?: string
  status: string; sla_minutes?: number; config: ZoneConfig; pincodeList?: string[]
}
