import { render } from "preact";
import { setLogContext } from "../../core/logger";
import { useState } from "preact/hooks";
import { AccountList } from "./AccountList";
import { AddAccountDialog } from "./AddAccountDialog";
import { DraftList } from "./DraftList";
import { LogList } from "./LogList";
import { QueueList } from "./QueueList";

function Options() {
  const [showAdd, setShowAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <main style={{ padding: 24, maxWidth: 720, fontFamily: "system-ui, sans-serif" }}>
      <h1>🪶 Plume Settings</h1>
      <AccountList key={refreshKey} onAddClick={() => setShowAdd(true)} />
      <QueueList />
      <DraftList />
      <LogList />
      {showAdd && (
        <AddAccountDialog
          onClose={() => setShowAdd(false)}
          onAdded={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </main>
  );
}

setLogContext("options");

const root = document.getElementById("app");
if (root) {
  render(<Options />, root);
}
