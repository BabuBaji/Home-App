package com.homehelp.customer;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Opens a SPECIFIC UPI app directly (PhonePe / Google Pay / Paytm / BHIM) using package
 * targeting — something a WebView / AppLauncher cannot do. The standard `upi://pay?...` data
 * URI is launched with Intent.setPackage(<app package>), which takes the user straight to that
 * app's PAY screen with the amount prefilled (no chooser).
 *
 * Because UPI intents return a result, we use startActivityForResult and parse the response
 * ("txnId=...&Status=SUCCESS&txnRef=...") so JS gets the real payment status, not a guess.
 *
 *   pay({ url, package }) -> { status, response, resultCode }
 *     status: SUCCESS | FAILURE | SUBMITTED | CANCELLED | UNKNOWN
 */
@CapacitorPlugin(name = "Upi")
public class UpiPlugin extends Plugin {

    @PluginMethod
    public void pay(PluginCall call) {
        String url = call.getString("url");
        String pkg = call.getString("package");
        if (url == null || url.isEmpty()) { call.reject("Missing UPI url"); return; }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        if (pkg != null && !pkg.isEmpty()) intent.setPackage(pkg);

        // No matching app (e.g. PhonePe not installed) — let JS fall back to the chooser.
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("APP_NOT_FOUND");
            return;
        }
        startActivityForResult(call, intent, "upiResult");
    }

    /** Returns, for each requested package, whether it's installed + its real launcher icon
     *  (base64 PNG) + label — so the UI can show the actual PhonePe/GPay/Paytm logos. */
    @PluginMethod
    public void appsInfo(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSObject apps = new JSObject();
        try {
            JSArray packages = call.getArray("packages");
            List<Object> list = packages.toList();
            for (Object o : list) {
                String pkg = String.valueOf(o);
                JSObject info = new JSObject();
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    info.put("installed", true);
                    info.put("label", pm.getApplicationLabel(ai).toString());
                    info.put("icon", "data:image/png;base64," + drawableToBase64(pm.getApplicationIcon(ai)));
                } catch (PackageManager.NameNotFoundException e) {
                    info.put("installed", false);
                }
                apps.put(pkg, info);
            }
        } catch (Exception e) { /* return whatever we have */ }
        JSObject ret = new JSObject();
        ret.put("apps", apps);
        call.resolve(ret);
    }

    private String drawableToBase64(Drawable d) {
        int w = d.getIntrinsicWidth() > 0 ? Math.min(d.getIntrinsicWidth(), 144) : 96;
        int h = d.getIntrinsicHeight() > 0 ? Math.min(d.getIntrinsicHeight(), 144) : 96;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        d.setBounds(0, 0, w, h);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    @ActivityCallback
    private void upiResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        String response = (data != null) ? data.getStringExtra("response") : null;

        String status = "UNKNOWN";
        if (response != null) {
            for (String part : response.split("&")) {
                String[] kv = part.split("=");
                if (kv.length == 2 && kv[0].trim().equalsIgnoreCase("Status")) {
                    status = kv[1].trim().toUpperCase();
                }
            }
        } else if (result.getResultCode() == Activity.RESULT_CANCELED) {
            status = "CANCELLED";
        }

        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("response", response == null ? "" : response);
        ret.put("resultCode", result.getResultCode());
        call.resolve(ret);
    }
}
