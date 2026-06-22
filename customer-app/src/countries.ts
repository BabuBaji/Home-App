export interface Country { code: string; name: string; dial: string; flag: string; cur: string }

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳', cur: '₹' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', cur: '$' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', cur: '£' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪', cur: 'AED' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬', cur: 'S$' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺', cur: 'A$' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦', cur: 'C$' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦', cur: 'SAR' },
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾', cur: 'RM' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦', cur: 'R' },
]
