import { type CallbackReply, CALLBACK_URL, parseCallback } from "../core/auth-callback";
import { browser } from "../core/browser-api";

/**
 * Runs only on Plume's own callback page. Hands the authorization server's
 * answer to the background script, which owns the pending sign-in, and
 * reports back into the page. It reads the address and writes one element;
 * nothing else on the page is touched.
 */
export default defineContentScript({
  matches: [`${CALLBACK_URL}*`],
  runAt: "document_end",
  async main() {
    const status = document.getElementById("status");
    const say = (text: string): void => {
      if (status) status.textContent = text;
    };
    try {
      // Set before sendMessage: the page's own fallback only fires while its
      // original text is unchanged, and a slow exchange could otherwise let
      // it flash "Plume didn't respond" while the background is still working.
      say("Talking to your site…");
      const reply = (await browser.runtime.sendMessage(
        parseCallback(location.search),
      )) as CallbackReply;
      say(
        reply.ok
          ? `Connected ${reply.domain}. You can close this tab.`
          : `Sign-in failed: ${reply.error}`,
      );
    } catch (e) {
      say(`Plume could not finish signing in: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
