export function base64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(48);
  crypto.getRandomValues(random);
  const verifier = base64urlEncode(random).slice(0, 64);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64urlEncode(new Uint8Array(hash));
  return { verifier, challenge };
}
