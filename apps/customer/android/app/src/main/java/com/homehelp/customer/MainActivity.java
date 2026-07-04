package com.homehelp.customer;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

public class MainActivity extends BridgeActivity implements PaymentResultWithDataListener {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationServicesPlugin.class);
        registerPlugin(UpiPlugin.class);
        registerPlugin(RazorpayPlugin.class);
        super.onCreate(savedInstanceState);
        // Warm up the Razorpay SDK at launch so the checkout opens instantly on first tap.
        try { Checkout.preload(getApplicationContext()); } catch (Exception ignored) {}
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == LocationServicesPlugin.REQ_ENABLE) {
            PluginHandle handle = getBridge().getPlugin("LocationServices");
            if (handle != null && handle.getInstance() instanceof LocationServicesPlugin) {
                ((LocationServicesPlugin) handle.getInstance()).handleEnableResult();
            }
        }
    }

    // ----- Razorpay native checkout callbacks (forwarded to RazorpayPlugin) -----
    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData data) {
        RazorpayPlugin p = razorpay();
        if (p != null) {
            String orderId = data != null ? data.getOrderId() : null;
            String signature = data != null ? data.getSignature() : null;
            p.onSuccess(razorpayPaymentId, orderId, signature);
        }
    }

    @Override
    public void onPaymentError(int code, String response, PaymentData data) {
        RazorpayPlugin p = razorpay();
        if (p != null) p.onError(code, response);
    }

    private RazorpayPlugin razorpay() {
        if (getBridge() == null) return null;
        PluginHandle h = getBridge().getPlugin("RazorpayNative");
        if (h != null && h.getInstance() instanceof RazorpayPlugin) return (RazorpayPlugin) h.getInstance();
        return null;
    }
}
