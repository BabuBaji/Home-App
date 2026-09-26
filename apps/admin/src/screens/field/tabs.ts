import { Siren, Activity, Users, UserCircle2 } from 'lucide-react'

/* The Field app's bottom tabs and the permission each one needs (Me is always shown). */
export type FieldTab = { to: string; label: string; perm?: string; icon: typeof Siren }
export const FIELD_TABS: FieldTab[] = [
  { to: 'sos', label: 'SOS', perm: 'safety.view', icon: Siren },
  { to: 'jobs', label: 'Live jobs', perm: 'liveops.view', icon: Activity },
  { to: 'team', label: 'Team', perm: 'workers.view', icon: Users },
  { to: 'me', label: 'Me', icon: UserCircle2 },
]
