package com.cptbendova.rolecraftvault;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TransferKeepAlivePlugin.class);
        registerPlugin(DeviceUnlockPlugin.class);
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= 33) {
            setRecentsScreenshotEnabled(false);
        }
        int navy = Color.parseColor("#0A0E1C");
        window.setStatusBarColor(navy);
        window.setNavigationBarColor(navy);
        WindowCompat.setDecorFitsSystemWindows(window, true);
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insets != null) {
            insets.setAppearanceLightStatusBars(false);
            insets.setAppearanceLightNavigationBars(false);
        }

        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setBackgroundColor(navy);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView current = bridge == null ? null : bridge.getWebView();
                if (current == null) {
                    passThrough(this);
                    return;
                }
                current.evaluateJavascript(
                    "(function(){try{return typeof window.__rcvAndroidBack==='function'&&window.__rcvAndroidBack()===true;}catch(e){return false;}})();",
                    result -> { if (!"true".equals(String.valueOf(result).trim())) passThrough(this); });
            }
        });
    }

    private void passThrough(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        pingBackground();
    }

    @Override
    public void onPause() {
        super.onPause();
        pingBackground();
    }

    private void pingBackground() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.evaluateJavascript(
            "(function(){try{if(typeof window.__rcvOnBackground==='function')window.__rcvOnBackground();}catch(e){}})();",
            null);
    }
}
