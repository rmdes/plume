import { render } from "preact";

function Popup() {
  return <main style={{ padding: 16, minWidth: 320 }}>Plume — coming soon.</main>;
}

const root = document.getElementById("app");
if (root) {
  render(<Popup />, root);
}
