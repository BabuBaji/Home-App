// Permission catalog + system-role bundles — the single source of truth for admin RBAC.
// ---------------------------------------------------------------------------------------
// One flat namespace of `module.action` keys. The admin service seeds/serves this; the panel
// renders the matrix from it; requirePerm() checks against it. There is no second copy to keep
// in sync (the old `RANK` map lived in two files) — everything derives from here.
//
// Bundles are CUMULATIVE by design: support ⊂ manager ⊂ admin, and super = every key. This exactly
// reproduces the old role-rank model (super>admin>manager>support) so seeding the four system roles
// changes nobody's access on day one. Custom roles are arbitrary subsets, no rank implied.

/** UI grouping for the permission matrix. Each group is one module; its `perms` are the real,
 *  irregular actions that module supports (not a forced view/add/edit/delete/export grid). */
export const PERMISSION_CATALOG = [
  { module: 'dashboard', label: 'Dashboard', perms: [
    { key: 'dashboard.view', label: 'View dashboard' },
  ] },
  { module: 'customers', label: 'Customers', perms: [
    { key: 'customers.view', label: 'View customers' },
    { key: 'customers.edit', label: 'Edit customers' },
    { key: 'customers.export', label: 'Export' },
  ] },
  { module: 'workers', label: 'Workers (Pros)', perms: [
    { key: 'workers.view', label: 'View workers' },
    { key: 'workers.create', label: 'Add / onboard workers' },
    { key: 'workers.edit', label: 'Edit worker profile' },
    { key: 'workers.suspend', label: 'Suspend / activate' },
    { key: 'workers.delete', label: 'Delete worker' },
    { key: 'workers.pay_view', label: 'View pay & salary' },
    { key: 'workers.pay_edit', label: 'Edit pay & salary' },
    { key: 'workers.export', label: 'Export' },
  ] },
  { module: 'bookings', label: 'Bookings', perms: [
    { key: 'bookings.view', label: 'View bookings' },
    { key: 'bookings.assign', label: 'Assign a pro' },
    { key: 'bookings.update_status', label: 'Update status' },
    { key: 'bookings.cancel', label: 'Cancel booking' },
    { key: 'bookings.export', label: 'Export' },
  ] },
  { module: 'services', label: 'Services', perms: [
    { key: 'services.view', label: 'View services' },
    { key: 'services.create', label: 'Create service' },
    { key: 'services.edit', label: 'Edit service' },
    { key: 'services.delete', label: 'Delete service' },
  ] },
  { module: 'campaigns', label: 'Campaigns & Offers', perms: [
    { key: 'campaigns.view', label: 'View campaigns' },
    { key: 'campaigns.create', label: 'Create campaign' },
    { key: 'campaigns.edit', label: 'Edit campaign' },
    { key: 'campaigns.delete', label: 'Delete campaign' },
  ] },
  { module: 'payments', label: 'Payments', perms: [
    { key: 'payments.view', label: 'View payments' },
    { key: 'payments.export', label: 'Export' },
  ] },
  { module: 'refunds', label: 'Refunds', perms: [
    { key: 'refunds.view', label: 'View refunds' },
    { key: 'refunds.approve', label: 'Approve / process refund' },
  ] },
  { module: 'finance', label: 'Finance & Settlement', perms: [
    { key: 'finance.view', label: 'View finance (settlements/payouts/ledger)' },
    { key: 'finance.settle', label: 'Run settlement' },
    { key: 'finance.payout', label: 'Process payout' },
    { key: 'finance.export', label: 'Export' },
  ] },
  { module: 'wallet', label: 'Worker Wallet', perms: [
    { key: 'wallet.view', label: 'View worker wallets' },
    { key: 'wallet.adjust', label: 'Add funds / adjust balance' },
  ] },
  { module: 'zones', label: 'Zone Operations', perms: [
    { key: 'zones.view', label: 'View zones/cities/clusters/apartments/stores' },
    { key: 'zones.edit', label: 'Edit zone hierarchy' },
    { key: 'zones.stores_override', label: 'Override store coverage overlap' },
  ] },
  { module: 'pricing', label: 'Pricing', perms: [
    { key: 'pricing.view', label: 'View pricing' },
    { key: 'pricing.edit', label: 'Edit pricing' },
  ] },
  { module: 'liveops', label: 'Live Ops', perms: [
    { key: 'liveops.view', label: 'View live ops' },
    { key: 'liveops.act', label: 'Reassign / intervene' },
  ] },
  { module: 'roster', label: 'Shifts / Roster', perms: [
    { key: 'roster.view', label: 'View roster' },
    { key: 'roster.edit', label: 'Edit shifts / roster' },
  ] },
  { module: 'attendance', label: 'Shift Plans & Attendance', perms: [
    { key: 'attendance.view', label: 'View attendance' },
    { key: 'attendance.edit', label: 'Edit shift plans / attendance' },
  ] },
  { module: 'training', label: 'Training & Assessment', perms: [
    { key: 'training.view', label: 'View training' },
    { key: 'training.manage', label: 'Manage modules / assessments' },
  ] },
  { module: 'equipment', label: 'Equipment', perms: [
    { key: 'equipment.view', label: 'View equipment' },
    { key: 'equipment.manage', label: 'Issue / manage equipment' },
  ] },
  { module: 'salary_plans', label: 'Salary Plans', perms: [
    { key: 'salary_plans.view', label: 'View salary plans' },
    { key: 'salary_plans.edit', label: 'Edit salary plans' },
  ] },
  { module: 'incentive_plans', label: 'Incentive Plans', perms: [
    { key: 'incentive_plans.view', label: 'View incentive plans' },
    { key: 'incentive_plans.edit', label: 'Edit incentive plans' },
  ] },
  { module: 'comp_rules', label: 'Compensation Rules', perms: [
    { key: 'comp_rules.view', label: 'View compensation rules' },
    { key: 'comp_rules.edit', label: 'Author / edit rules' },
  ] },
  { module: 'payroll', label: 'Payroll', perms: [
    { key: 'payroll.view', label: 'View payroll' },
    { key: 'payroll.run', label: 'Build / draft a run' },
    { key: 'payroll.approve', label: 'Approve a run (pays workers)' },
  ] },
  { module: 'complaints', label: 'Complaints', perms: [
    { key: 'complaints.view', label: 'View complaints' },
    { key: 'complaints.resolve', label: 'Resolve complaints' },
  ] },
  { module: 'cancellations', label: 'Cancellations', perms: [
    { key: 'cancellations.view', label: 'View cancellations' },
  ] },
  { module: 'notifications', label: 'Notifications', perms: [
    { key: 'notifications.view', label: 'View notifications' },
    { key: 'notifications.send', label: 'Send notifications' },
  ] },
  { module: 'tickets', label: 'Support Tickets', perms: [
    { key: 'tickets.view', label: 'View tickets' },
    { key: 'tickets.resolve', label: 'Resolve tickets' },
  ] },
  { module: 'reports', label: 'Reports', perms: [
    { key: 'reports.view', label: 'View reports' },
    { key: 'reports.export', label: 'Export' },
  ] },
  { module: 'analytics', label: 'Analytics', perms: [
    { key: 'analytics.view', label: 'View analytics' },
  ] },
  { module: 'activity', label: 'Activity Monitor', perms: [
    { key: 'activity.view', label: 'View activity' },
  ] },
  { module: 'settings', label: 'Settings', perms: [
    { key: 'settings.view', label: 'View settings' },
    { key: 'settings.edit', label: 'Edit settings' },
  ] },
  { module: 'admins', label: 'Admin Users', perms: [
    { key: 'admins.view', label: 'View admin users' },
    { key: 'admins.create', label: 'Create admin user' },
    { key: 'admins.edit', label: 'Edit admin user' },
    { key: 'admins.delete', label: 'Delete admin user' },
  ] },
  { module: 'roles', label: 'Roles & Permissions', perms: [
    { key: 'roles.view', label: 'View roles' },
    { key: 'roles.manage', label: 'Create / edit / delete roles' },
  ] },
]

/** Every permission key, flat. Super holds all of these. */
export const ALL_PERMISSIONS = PERMISSION_CATALOG.flatMap((g) => g.perms.map((p) => p.key))
const has = (key) => ALL_PERMISSIONS.includes(key)

// ---- Cumulative system-role bundles (each layer adds to the one below) ----

// support — the "no nav min" set today: read-most, plus the support desk (complaints/tickets).
const SUPPORT = [
  'dashboard.view',
  'customers.view',
  'workers.view',
  'bookings.view',
  'services.view',
  'payments.view',
  'refunds.view',
  'wallet.view',
  'complaints.view', 'complaints.resolve',
  'cancellations.view',
  'notifications.view',
  'tickets.view', 'tickets.resolve',
  'reports.view', 'reports.export',
  'analytics.view',
  'activity.view',
  'settings.view',
]

// manager — adds customer/worker/booking operations, services + campaigns editing, refunds & wallet
// actions (min:'manager' items and the manager-gated buttons/catalog CRUD today).
const MANAGER = dedupe([
  ...SUPPORT,
  'customers.edit', 'customers.export',
  'workers.create', 'workers.edit', 'workers.export',
  'bookings.assign', 'bookings.update_status', 'bookings.cancel', 'bookings.export',
  'services.create', 'services.edit',
  'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
  'refunds.approve',
  'wallet.adjust',
  'payments.export',
  'notifications.send',
])

// admin — adds everything gated min:'admin' today: the whole Zone Ops + Operations back office,
// worker lifecycle (delete/suspend/pay), finance, payroll, settings editing, and viewing admins/roles.
const ADMIN = dedupe([
  ...MANAGER,
  'workers.suspend', 'workers.delete', 'workers.pay_view', 'workers.pay_edit',
  'services.delete',
  'zones.view', 'zones.edit',
  'pricing.view', 'pricing.edit',
  'liveops.view', 'liveops.act',
  'roster.view', 'roster.edit',
  'attendance.view', 'attendance.edit',
  'training.view', 'training.manage',
  'equipment.view', 'equipment.manage',
  'salary_plans.view', 'salary_plans.edit',
  'incentive_plans.view', 'incentive_plans.edit',
  'comp_rules.view', 'comp_rules.edit',
  'payroll.view', 'payroll.run', 'payroll.approve',
  'finance.view', 'finance.settle', 'finance.payout', 'finance.export',
  'settings.edit',
  'admins.view',
  'roles.view',
])

// super — everything, including admin-user management, role authoring, and super-only overrides.
export const SYSTEM_ROLES = [
  { key: 'super', name: 'Super Admin', description: 'Full system access.', rank: 4, landing: '/dashboard' },
  { key: 'admin', name: 'Admin', description: 'Manage platform operations and the back office.', rank: 3, landing: '/dashboard' },
  { key: 'manager', name: 'Manager', description: 'Oversee day-to-day city operations.', rank: 2, landing: '/dashboard' },
  { key: 'support', name: 'Support', description: 'Handle customer support, complaints and tickets.', rank: 1, landing: '/dashboard' },
]

/** roleKey → permission keys for the seeded system roles. super = every key. */
export const SYSTEM_ROLE_PERMISSIONS = {
  super: [...ALL_PERMISSIONS],
  admin: ADMIN,
  manager: MANAGER,
  support: SUPPORT,
}

/** true for the four seeded, non-deletable roles. */
export const isSystemRole = (key) => SYSTEM_ROLES.some((r) => r.key === key)

function dedupe(list) {
  const seen = new Set()
  const out = []
  for (const k of list) {
    if (!has(k)) throw new Error(`permissions.js: unknown permission key in a bundle: ${k}`)
    if (!seen.has(k)) { seen.add(k); out.push(k) }
  }
  return out
}
