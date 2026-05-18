interface Target {
  uid: string;
  name: string;
}

interface Props {
  targets: Target[];
  values: string[];
  onChange: (next: string[]) => void;
}

export function SyndicateChips({ targets, values, onChange }: Props) {
  if (targets.length === 0) {
    return (
      <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
        No syndication targets configured on server.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {targets.map((t) => {
        const selected = values.includes(t.uid);
        return (
          <button
            key={t.uid}
            type="button"
            onClick={() =>
              onChange(selected ? values.filter((v) => v !== t.uid) : [...values, t.uid])
            }
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
              background: selected ? "#3b82f6" : "transparent",
              color: selected ? "white" : "inherit",
              border: "1px solid #3b82f6",
              cursor: "pointer",
            }}
          >
            ⇄ {t.name}
          </button>
        );
      })}
    </div>
  );
}
