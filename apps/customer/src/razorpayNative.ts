import { registerPlugin } from '@capacitor/core'

// Bridge to the native RazorpayPlugin (android/.../RazorpayPlugin.java). Opens the native Razorpay
// checkout, which fires the real UPI intent so PhonePe/GPay/Paytm open directly, and returns a
// verifiable payment id/signature.
export interface RazorpayNativePlugin {
  open(opts: {
    key: string
    orderId: string
    amount: number // in paise
    currency?: string
    name?: string
    description?: string
    contact?: string
    email?: string
  }): Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }>
}

export const RazorpayNative = registerPlugin<RazorpayNativePlugin>('RazorpayNative')
