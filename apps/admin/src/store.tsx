import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Admin } from './types'
import { clearToken, setToken, saveAdmin, loadAdmin, clearAdmin } from './api'

interface Store {
  admin: Admin | null
  signIn: (token: string, admin: Admin) => void
  signOut: () => void
  setAdmin: (a: Admin) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [admin, setAdminState] = useState<Admin | null>(loadAdmin())
  const signIn = useCallback((t: string, a: Admin) => { setToken(t); saveAdmin(a); setAdminState(a) }, [])
  const signOut = useCallback(() => { clearToken(); clearAdmin(); setAdminState(null) }, [])
  const setAdmin = useCallback((a: Admin) => { saveAdmin(a); setAdminState(a) }, [])
  return <Ctx.Provider value={{ admin, signIn, signOut, setAdmin }}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be inside StoreProvider')
  return c
}

// role helper: super > admin > manager > support
const RANK: Record<string, number> = { super: 4, admin: 3, manager: 2, support: 1 }
export const can = (role: string | undefined, min: string) => (RANK[role || ''] || 0) >= (RANK[min] || 0)
