package com.homehelp.customer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;

import org.json.JSONObject;

/**
 * Native Razorpay Checkout bridge. Unlike the web checkout (which cannot launch UPI apps from a
 * WebView), the native SDK fires the real Android UPI intent, so tapping PhonePe / Google Pay /
 * Paytm opens that app directly with the amount prefilled — then returns a verifiable payment id.
 *
 *   open({ key, orderId, amount, currency, name, description, contact, email })
 *     -> { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 *
 * The Checkout callbacks are delivered to MainActivity (which implements
 * PaymentResultWithDataListener); it forwards them here via onSuccess / onError.
 */
@CapacitorPlugin(name = "RazorpayNative")
public class RazorpayPlugin extends Plugin {

    private PluginCall pendingCall;

    @PluginMethod
    public void open(PluginCall call) {
        String key = call.getString("key");
        String orderId = call.getString("orderId");
        if (key == null || key.isEmpty()) { call.reject("Missing Razorpay key"); return; }
        if (orderId == null || orderId.isEmpty()) { call.reject("Missing order id"); return; }

        pendingCall = call;
        try {
            final Checkout checkout = new Checkout();
            checkout.setKeyID(key);

            final JSONObject options = new JSONObject();
            options.put("name", call.getString("name", "HomeHelp"));
            options.put("description", call.getString("description", "Service booking"));
            options.put("order_id", orderId);
            options.put("currency", call.getString("currency", "INR"));
            if (call.getInt("amount") != null) options.put("amount", call.getInt("amount"));
            options.put("theme", new JSONObject().put("color", "#5b51e8"));

            JSONObject prefill = new JSONObject();
            String contact = call.getString("contact");
            String email = call.getString("email");
            if (contact != null && !contact.isEmpty()) prefill.put("contact", contact);
            if (email != null && !email.isEmpty()) prefill.put("email", email);
            // UPI-first: preselect UPI so the app opens straight into the UPI-app choices.
            prefill.put("method", "upi");
            options.put("prefill", prefill);

            getActivity().runOnUiThread(() -> {
                try {
                    checkout.open(getActivity(), options);
                } catch (Exception e) {
                    reject("Could not open checkout: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            reject("Razorpay error: " + e.getMessage());
        }
    }

    /** Called by MainActivity.onPaymentSuccess */
    public void onSuccess(String paymentId, String orderId, String signature) {
        if (pendingCall == null) return;
        JSObject ret = new JSObject();
        ret.put("razorpay_payment_id", paymentId == null ? "" : paymentId);
        ret.put("razorpay_order_id", orderId == null ? "" : orderId);
        ret.put("razorpay_signature", signature == null ? "" : signature);
        pendingCall.resolve(ret);
        pendingCall = null;
    }

    /** Called by MainActivity.onPaymentError */
    public void onError(int code, String description) {
        reject(description != null && !description.isEmpty() ? description : ("Payment failed (" + code + ")"));
    }

    private void reject(String msg) {
        if (pendingCall != null) { pendingCall.reject(msg); pendingCall = null; }
    }
}
