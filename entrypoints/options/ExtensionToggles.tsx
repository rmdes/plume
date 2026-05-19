import { useEffect, useState } from "preact/hooks";
import { KNOWN_EXTENSIONS } from "../../core/extensions";
import { accountStore } from "../../storage";

interface Props {
  domain: string;
}

export function ExtensionToggles({ domain }: Props) {
  const [enabled, setEnabled] = useState<string[]>([]);

  useEffect(() => {
    accountStore().getEnabledExtensions(domain).then(setEnabled);
  }, [domain]);

  async function toggle(id: string) {
    const next = enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id];
    setEnabled(next);
    await accountStore().setEnabledExtensions(domain, next);
  }

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, color: "#666" }}>Extensions</summary>
      <div style={{ display: "grid", gap: 4, padding: 8 }}>
        {Object.values(KNOWN_EXTENSIONS).map((ext) => (
          <label key={ext.id} style={{ display: "flex", gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={enabled.includes(ext.id)}
              onChange={() => toggle(ext.id)}
            />
            <span>
              <strong>{ext.label}</strong>
              <br />
              <span style={{ color: "#999" }}>
                {ext.description}
                {ext.reference && (
                  <>
                    {" "}
                    <a
                      href={ext.reference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={ext.reference.title}
                      style={{ color: "#3b82f6" }}
                    >
                      About this convention →
                    </a>
                  </>
                )}
              </span>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}
