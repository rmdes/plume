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
