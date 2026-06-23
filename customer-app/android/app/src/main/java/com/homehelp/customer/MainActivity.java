package com.homehelp.customer;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationServicesPlugin.class);
        super.onCreate(savedInstanceState);
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
}
