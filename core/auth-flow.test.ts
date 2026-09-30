import { describe, expect, it } from "vitest";
import { pickAuthFlow } from "./auth-flow";

describe("pickAuthFlow", () => {
  it("uses the identity flow when it is available and not overridden", () => {
    expect(pickAuthFlow({}, true)).toBe("identity");
    expect(pickAuthFlow({ tabSignIn: false }, true)).toBe("identity");
  });

  it("uses the tab flow when the identity API is missing", () => {
    expect(pickAuthFlow({}, false)).toBe("tab");
  });

  it("uses the tab flow when the user asked for it, even with identity available", () => {
    expect(pickAuthFlow({ tabSignIn: true }, true)).toBe("tab");
  });
});
