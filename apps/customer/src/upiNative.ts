import { registerPlugin } from '@capacitor/core'

// Bridge to the native UpiPlugin (android/app/.../UpiPlugin.java). Opens a specific UPI app
// directly via package targeting and returns the real UPI result.
export interface UpiAppInfo { installed: boolean; icon?: string; label?: string }
export interface UpiPlugin {
  pay(opts: { url: string; package?: string }): Promise<{ status: string; response: string; resultCode: number }>
  appsInfo(opts: { packages: string[] }): Promise<{ apps: Record<string, UpiAppInfo> }>
}

export const Upi = registerPlugin<UpiPlugin>('Upi')
