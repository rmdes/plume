import { render } from "preact";

function Options() {
  return <main style={{ padding: 24, maxWidth: 720 }}>Plume settings — coming soon.</main>;
}

const root = document.getElementById("app");
if (root) {
  render(<Options />, root);
}
