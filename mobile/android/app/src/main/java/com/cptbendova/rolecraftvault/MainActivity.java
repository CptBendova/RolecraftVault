package com.cptbendova.rolecraftvault;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TransferKeepAlivePlugin.class);
        registerPlugin(TransferTransportPlugin.class);
        registerPlugin(DeviceUnlockPlugin.class);
        registerPlugin(FileExportPlugin.class);
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
        /* Android 15 enforces edge-to-edge for this target level and Android 16
           removes the opt-out completely. On those versions, asking decor to
           fit the bars can be ignored and leaves the WebView's controls under
           the status bar, navigation buttons, or a display cutout. Older
           versions still use the platform's reliable fitted-window behavior. */
        WindowCompat.setDecorFitsSystemWindows(
            window,
            Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM
        );
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insets != null) {
            insets.setAppearanceLightStatusBars(false);
            insets.setAppearanceLightNavigationBars(false);
        }

        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            View content = findViewById(android.R.id.content);
            if (content != null) {
                final int safeTypes = WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout();
                ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
                    Insets safe = windowInsets.getInsets(safeTypes);
                    view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                    /* The native container has used these insets. Zero only
                       those types before the WebView sees them so CSS does not
                       add the same safe area a second time. Do not CONSUME the
                       whole object: IME changes must keep reaching the WebView. */
                    return new WindowInsetsCompat.Builder(windowInsets)
                        .setInsets(safeTypes, Insets.NONE)
                        .build();
                });
                ViewCompat.requestApplyInsets(content);
            }
        }

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

    @Override
    public void onResume() {
        super.onResume();
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        webView.evaluateJavascript(
            "(function(){try{if(typeof window.__rcvOnForeground==='function')window.__rcvOnForeground();}catch(e){}})();",
            null);
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
