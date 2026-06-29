package com.homehelp.customer;

import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsResponse;
import com.google.android.gms.location.Priority;
import com.google.android.gms.location.SettingsClient;
import com.google.android.gms.tasks.Task;

/**
 * Bridges the system location-services state to JS:
 *   check()         -> { enabled }
 *   requestEnable() -> { enabled }  (pops the in-app "Turn on location" dialog
 *                                    via Play Services; falls back to the
 *                                    location-settings screen)
 */
@CapacitorPlugin(name = "LocationServices")
public class LocationServicesPlugin extends Plugin {
    static final int REQ_ENABLE = 0x4c4f; // 'LO'
    private PluginCall pendingCall;

    private boolean isEnabled() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        try {
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    private void resolveEnabled(PluginCall call, boolean enabled) {
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void check(PluginCall call) {
        resolveEnabled(call, isEnabled());
    }

    @PluginMethod
    public void requestEnable(final PluginCall call) {
        if (isEnabled()) { resolveEnabled(call, true); return; }

        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000).build();
        LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
            .addLocationRequest(req)
            .setAlwaysShow(true)
            .build();

        SettingsClient client = LocationServices.getSettingsClient(getActivity());
        Task<LocationSettingsResponse> task = client.checkLocationSettings(settingsRequest);

        task.addOnSuccessListener(getActivity(), resp -> resolveEnabled(call, true));
        task.addOnFailureListener(getActivity(), e -> {
            if (e instanceof ResolvableApiException) {
                try {
                    pendingCall = call;
                    bridge.saveCall(call);
                    ((ResolvableApiException) e).startResolutionForResult(getActivity(), REQ_ENABLE);
                } catch (Exception ex) {
                    openSettingsFallback(call);
                }
            } else {
                openSettingsFallback(call);
            }
        });
    }

    private void openSettingsFallback(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
        }
        resolveEnabled(call, isEnabled());
    }

    /** Invoked from MainActivity once the system enable-location dialog returns. */
    public void handleEnableResult() {
        if (pendingCall != null) {
            resolveEnabled(pendingCall, isEnabled());
            pendingCall = null;
        }
    }
}
