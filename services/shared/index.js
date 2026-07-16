// @homehelp/shared — one import surface for every service.
export * from './db.js'
export * from './events.js'
export * from './realtime.js'
export * from './internal.js'
export * from './admin-auth.js'
// permissions.js is pure data + helpers (no deps) — safe to re-export for the RBAC layer.
export * from './permissions.js'
export * from './config.js'
// Safe to re-export: sms.js only needs config.js + global fetch, no extra dependency.
export * from './sms.js'
// jwt.js is NOT re-exported for the same reason as storage.js: it carries a dependency
// (jsonwebtoken) that only the services minting/verifying sessions install. Import it
// directly:  import { tokenSubject } from '@homehelp/shared/jwt.js'
// customer-auth.js is not re-exported either, and for the same reason — it now verifies signed
// tokens via jwt.js. The services that authenticate customers import it directly:
//   import { makeCustomerAuth } from '@homehelp/shared/customer-auth.js'
// NOT re-exported here on purpose: storage.js pulls in the AWS SDK, and every service imports
// this index. Only services that actually store files should carry that dependency, so they
// import it directly:  import { putObject } from '@homehelp/shared/storage.js'
