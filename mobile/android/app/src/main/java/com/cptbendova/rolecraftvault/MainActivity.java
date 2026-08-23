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
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TransferKeepAlivePlugin.class);
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
