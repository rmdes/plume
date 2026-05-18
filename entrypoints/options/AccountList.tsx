import { useEffect, useState } from "preact/hooks";
import type { TokenData } from "../../core/types";
import { accountStore } from "../../storage";

interface Props {
  onAddClick: () => void;
}

export function AccountList({ onAddClick }: Props) {
  const [accounts, setAccounts] = useState<TokenData[]>([]);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  async function refresh() {
    const store = accountStore();
    setAccounts(await store.list());
    setActiveDomain(await store.getDefaultDomain());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSetDefault(domain: string) {
    await accountStore().setDefault(domain);
    await refresh();
  }

  async function handleRemove(domain: string) {
    if (!confirm(`Remove account ${domain}?`)) return;
    await accountStore().remove(domain);
    await refresh();
  }

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Accounts</h2>
        <button onClick={onAddClick} type="button">
          + Add account
        </button>
      </header>
      {accounts.length === 0 ? (
        <p>No accounts yet. Click "Add account" to connect your Micropub blog.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {accounts.map((a) => {
            const domain = new URL(a.me).hostname;
            const isActive = domain === activeDomain;
            return (
              <li
                key={domain}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span style={{ fontWeight: isActive ? 600 : 400 }}>
                  {isActive ? "●" : "○"} {domain}
                </span>
                <span style={{ flex: 1, color: "#666", fontSize: 12 }}>scope: {a.scope}</span>
                {!isActive && (
                  <button onClick={() => handleSetDefault(domain)} type="button">
                    Set default
                  </button>
                )}
                <button onClick={() => handleRemove(domain)} type="button">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
