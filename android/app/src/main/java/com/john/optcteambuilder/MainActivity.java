package com.john.optcteambuilder;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are not auto-discovered the way packaged ones are.
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
