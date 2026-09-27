/* Private account panel. All provider access belongs to the native shell. */
(function () {
  "use strict";
  const React = window.React, h = React.createElement;
  const labels = { openrouter: "OpenRouter", openai: "OpenAI", xai: "xAI" };
  function bridge() {
    if (window.providerBalances) return window.providerBalances;
    if (!window.Capacitor || typeof window.Capacitor.nativePromise !== "function") return null;
    const call = (method, args) => window.Capacitor.nativePromise("ProviderBalances", method, args || {});
    return { status: () => call("status"), refresh: args => call("refresh", args), cancel: args => call("cancel", args), openDashboard: args => call("openDashboard", args), setUnlocked: args => call("setUnlocked", args) };
  }
  function money(value) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " USD" : "Unavailable"; }
  function ProviderBalances({ providers = ["openrouter", "openai", "xai"], disabled = false }) {
    const native = React.useMemo(bridge, []);
    const [results, setResults] = React.useState({}), [busy, setBusy] = React.useState(null), [error, setError] = React.useState("");
    const pending = React.useRef(null), epoch = React.useRef(0);
    React.useEffect(() => {
      const clear = () => { epoch.current++; const requestId = pending.current; pending.current = null; if (requestId && native) native.cancel({ requestId }).catch(() => {}); setBusy(null); setResults({}); setError(""); };
      const visibility = () => { if (document.hidden) clear(); };
      window.addEventListener("rcv-locking", clear); window.addEventListener("rcv-provider-key-changed", clear); document.addEventListener("visibilitychange", visibility);
      return () => { clear(); window.removeEventListener("rcv-locking", clear); window.removeEventListener("rcv-provider-key-changed", clear); document.removeEventListener("visibilitychange", visibility); };
    }, [native]);
    React.useEffect(() => {
      if (!disabled) return;
      epoch.current++; const requestId = pending.current; pending.current = null;
      if (requestId && native) native.cancel({ requestId }).catch(() => {});
      setBusy(null); setResults({}); setError("");
    }, [disabled, native]);
    const refresh = async provider => {
      if (!native || pending.current || disabled || document.hidden) return;
      const serial = ++epoch.current, requestId = "balance-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      pending.current = requestId; setBusy(provider); setError(""); setResults(previous => ({ ...previous, [provider]: null }));
      try { const result = await native.refresh({ provider, requestId }); if (epoch.current !== serial) return; if (!result || !result.ok) setError(result && result.error || "Could not check this provider."); else setResults(previous => ({ ...previous, [provider]: result })); }
      catch (_) { if (epoch.current === serial) setError("Could not check this provider. Reopen account settings and try again."); }
      finally { if (epoch.current === serial) { pending.current = null; setBusy(null); } }
    };
    const open = async provider => { try { const result = await native.openDashboard({ provider }); if (!result || !result.ok) setError(result && result.error || "Could not open billing."); } catch (_) { setError("Could not open billing. Check your device browser."); } };
    const button = { padding: "7px 10px", minWidth: 48, minHeight: 48, borderRadius: 8, border: "1px solid var(--line, #36415c)", background: "var(--panel, #182238)", color: "var(--text, #e6eaf2)", cursor: "pointer", font: "inherit", maxWidth: "100%", whiteSpace: "normal" };
    return h("section", { className: "provider-balances", "aria-label": "API balances", style: { minWidth: 0, fontSize: 12, lineHeight: 1.5, marginTop: 12 } },
      h("div", { style: { fontWeight: 700, marginBottom: 6 } }, "API balances"),
      [...new Set(providers)].filter(provider => typeof provider === "string" && Object.prototype.hasOwnProperty.call(labels, provider)).map(provider => {
        const result = results[provider];
        return h("div", { key: provider, "data-provider": provider, style: { border: "1px solid var(--line, #36415c)", borderRadius: 10, padding: 10, marginBottom: 7, overflowWrap: "break-word" } },
          h("strong", null, labels[provider]),
          h("div", null, "Account credit balance: view in provider billing"),
          provider === "openrouter" ? h(React.Fragment, null,
            h("div", { style: { marginTop: 5 } }, result ? result.limit === null ? "Key spending limit: no cap set" : "Key allowance remaining: " + money(result.remaining) : "Key allowance: refresh to check"),
            result && h("div", null, "Key usage (all time): " + money(result.usage)),
            result && result.limit !== null && h("div", null, "Key spending cap: " + money(result.limit) + (result.limitReset ? " · resets " + result.limitReset : " · no scheduled reset")),
            h("div", { style: { color: "var(--dim, #a2abc3)", marginTop: 4 } }, "A key allowance is a spending cap, not your account credit balance. Account credits require separate management access."),
            result && h("div", { style: { color: "var(--dim, #a2abc3)" } }, "Checked " + new Date(result.checkedAt).toLocaleTimeString() + ". Refresh after spending or adding credits.")
          ) : h("div", { style: { color: "var(--dim, #a2abc3)", marginTop: 4 } }, provider === "openai" ? "The saved image API key cannot retrieve a documented credit balance. Check the OpenAI billing page." : "The saved image API key cannot read xAI billing balances. Open the xAI console, then Billing > API spend management."),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 } },
            provider === "openrouter" && h("button", { type: "button", style: button, disabled: !native || disabled || !!busy, onClick: () => refresh(provider) }, busy === provider ? "Checking…" : "Refresh allowance"),
            busy === provider && h("button", { type: "button", style: button, onClick: () => { epoch.current++; const requestId = pending.current; pending.current = null; setBusy(null); native.cancel({ requestId }).catch(() => {}); } }, "Cancel"),
            h("button", { type: "button", style: button, disabled: !native || disabled || !!busy, onClick: () => open(provider) }, "Open " + labels[provider] + " billing")),
          provider === "openrouter" && h("div", { style: { color: "var(--dim, #a2abc3)", marginTop: 4 } }, "Refresh uses your saved Chat key for a read-only OpenRouter check."));
      }),
      native && h("div", { style: { color: "var(--dim, #a2abc3)" } }, "Billing opens in your browser. Choose the account or team that matches your saved API key."),
      !native && h("div", null, "Balance checks and billing shortcuts require an updated private Windows or Android app."),
      error && h("div", { role: "alert", style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--danger, #ffaaa7)" } }, error));
  }
  window.rolecraftProviderBalancesBridge = bridge;
  window.RolecraftProviderBalances = ProviderBalances;
})();
