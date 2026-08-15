import { useEffect, useState } from "preact/hooks";
import { browser } from "../../core/browser-api";
import { defaultsStore, logStore } from "../../storage";
import type { LogEntry } from "../../storage";

const LEVEL_COLOR: Record<LogEntry["level"], string> = {
  error: "crimson",
  warn: "#b45309",
  info: "#555",
};

export function LogList() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [enabled, setEnabled] = useState(false);

  async function refresh() {
    setEntries(await logStore().list());
  }

  useEffect(() => {
    refresh();
    defaultsStore()
      .get()
      .then((d) => setEnabled(d.debugLogging ?? false));

    // The background service worker writes most entries, so without this the
    // list only updates when the options page is reopened.
    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
      if (area === "local" && "logs" in changes) void refresh();
    }
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  async function toggle(value: boolean) {
    setEnabled(value);
    await defaultsStore().setDebugLogging(value);
  }

  async function clear() {
    await logStore().clear();
    await refresh();
  }

  async function copy() {
    const text = entries
      .map(
        (e) =>
          `${e.at} [${e.level}] (${e.context}) ${e.message}` +
          (e.data ? ` ${JSON.stringify(e.data)}` : ""),
      )
      .join("\n");
    await navigator.clipboard.writeText(text);
  }

  return (
    <section style={{ marginTop: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Debug log{entries.length > 0 ? ` (${entries.length})` : ""}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {entries.length > 0 && (
            <>
              <button type="button" onClick={copy}>
                Copy
              </button>
              <button type="button" onClick={clear}>
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      <label style={{ display: "block", margin: "8px 0", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void toggle((e.currentTarget as HTMLInputElement).checked)}
        />{" "}
        Record everything Plume does. Errors are recorded either way; this adds the steps leading up
        to them, which is what makes a bug report diagnosable.
      </label>

      {entries.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>Nothing logged yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
          {entries
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${e.at}-${i}`} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span style={{ color: "#999" }}>{new Date(e.at).toLocaleTimeString()}</span>{" "}
                <span style={{ color: LEVEL_COLOR[e.level], fontWeight: 600 }}>{e.level}</span>{" "}
                <span style={{ color: "#999" }}>({e.context})</span> {e.message}
                {e.data != null && (
                  <pre
                    style={{
                      margin: "4px 0 0",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "#555",
                    }}
                  >
                    {JSON.stringify(e.data, null, 2)}
                  </pre>
                )}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
