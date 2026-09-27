package com.cptbendova.rolecraftvault;

import java.io.IOException;

/** Strict projection of documented OpenRouter fields; never a provider body or key. */
final class ProviderBalancesCodec {
    static String dashboard(String provider) throws IOException {
        if ("openrouter".equals(provider)) return "https://openrouter.ai/settings/credits";
        if ("openai".equals(provider)) return "https://platform.openai.com/settings/organization/billing/overview";
        if ("xai".equals(provider)) return "https://console.x.ai/team/default/billing";
        throw new IOException("Choose a supported API provider.");
    }
    static Double amount(Object value, boolean nullable, boolean signed) throws IOException {
        if (nullable && value == null) return null;
        if (!(value instanceof Number)) throw new IOException("OpenRouter returned an invalid allowance response.");
        double amount = ((Number)value).doubleValue();
        if (!Double.isFinite(amount) || !signed && amount < 0 || Math.abs(amount) > 9007199254740991d) throw new IOException("OpenRouter returned an invalid allowance response.");
        return amount;
    }
    static String reset(Object value) {
        return "daily".equals(value) || "weekly".equals(value) || "monthly".equals(value) ? (String)value : null;
    }
    static String httpError(int code) {
        if (code == 401) return "OpenRouter rejected the saved API key. Check it in Chat settings.";
        if (code == 403) return "This key does not have permission to read its allowance. Check the provider dashboard.";
        if (code == 429) return "OpenRouter limited this check. Try Refresh later.";
        if (code >= 300 && code < 400) return "OpenRouter redirected this check. The redirect was refused.";
        return "OpenRouter could not provide the allowance (HTTP " + code + "). Try Refresh later.";
    }
}
