export type AuthFlowKind = "identity" | "tab";

/**
 * Which sign-in flow to run.
 *
 * `identity.launchWebAuthFlow` gives desktop browsers a self-closing auth
 * window, but it does not exist on Firefox for Android and misbehaves on some
 * desktop Chromium forks, so the tab flow is taken whenever the API is absent
 * or the user asked for it in settings. No user-agent sniffing: capability
 * plus preference is the whole rule.
 */
export function pickAuthFlow(
  prefs: { tabSignIn?: boolean },
  identityAvailable: boolean,
): AuthFlowKind {
  return prefs.tabSignIn || !identityAvailable ? "tab" : "identity";
}
