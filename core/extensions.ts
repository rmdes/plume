export interface ExtensionPropertyDef {
  key: string;
  label: string;
  widget: "text" | "textarea" | "enum";
  values?: string[];
  optional?: boolean;
}

export interface ExtensionReference {
  url: string;
  title: string;
}

export interface ExtensionDef {
  id: string;
  label: string;
  description: string;
  reference?: ExtensionReference;
  properties: ExtensionPropertyDef[];
}

/**
 * Inspect a server's merged config and return the IDs of known extensions
 * whose property keys are advertised by the server's `?q=post-types`.
 *
 * Spec ref: the Micropub spec defines `?q=post-types` responses as an array
 * of `{ type, name, properties[] }` objects. Each `properties[]` lists the
 * mf2 property keys that post type accepts. By scanning that union we can
 * detect whether the server is set up to accept an extension's properties
 * (e.g., `ai-text-level`, `ai-tools`) without inventing a new discovery
 * field. This is the YAGNI alternative to `mp-extensions` flagged earlier
 * in the project.
 *
 * Detection is conservative: an extension is detected if *any* of its
 * non-optional properties appear in the server's property set. Optional
 * properties don't influence detection — they're per-post opt-ins, not
 * server-capability signals.
 *
 * Surfaces in the options page as a "✓ Server supports this" badge; we
 * never auto-enable, the user still chooses.
 */
export function detectExtensions(serverConfig: {
  "post-types"?: Array<{ properties?: string[] }>;
}): string[] {
  const serverProps = new Set<string>();
  for (const postType of serverConfig["post-types"] ?? []) {
    for (const prop of postType.properties ?? []) {
      serverProps.add(prop);
    }
  }
  if (serverProps.size === 0) return [];
  const detected: string[] = [];
  for (const ext of Object.values(KNOWN_EXTENSIONS)) {
    const required = ext.properties.filter((p) => !p.optional);
    if (required.length === 0) continue;
    const allRequiredPresent = required.every((p) => serverProps.has(p.key));
    if (allRequiredPresent) detected.push(ext.id);
  }
  return detected;
}

export const KNOWN_EXTENSIONS: Record<string, ExtensionDef> = {
  "ai-metadata": {
    id: "ai-metadata",
    label: "AI transparency metadata",
    description: "Discloses AI involvement per post (level + tools used).",
    reference: {
      url: "https://rmendes.net/articles/2026/03/03/adding-ai-usage-metadata-to/",
      title: "Adding AI usage metadata to posts — convention rationale",
    },
    properties: [
      {
        key: "ai-text-level",
        label: "Text level",
        widget: "enum",
        values: ["0", "1", "2", "3"],
      },
      {
        key: "ai-code-level",
        label: "Code level",
        widget: "enum",
        values: ["0", "1", "2"],
        optional: true,
      },
      { key: "ai-tools", label: "Tools", widget: "text" },
      { key: "ai-description", label: "Description", widget: "textarea" },
    ],
  },
};
