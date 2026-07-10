// Shared list of serviceable cities with their state, used across admin forms/filters
// (Workers city field + filter, Service Zones city/state picker). Keep the primary launch
// cities near the top. `stateForCity` powers state auto-fill when a city is picked.
export type CityOption = { city: string; state: string }

export const CITIES: CityOption[] = [
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Delhi', state: 'Delhi' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Kolkata', state: 'West Bengal' },
  { city: 'Ahmedabad', state: 'Gujarat' },
  { city: 'Jaipur', state: 'Rajasthan' },
  { city: 'Lucknow', state: 'Uttar Pradesh' },
]

export const stateForCity = (city: string): string =>
  CITIES.find((c) => c.city.toLowerCase() === String(city || '').toLowerCase())?.state || ''
