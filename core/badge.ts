export interface BadgeInput {
  hasAuthNeeded: boolean;
  queueCount: number;
}

export interface BadgeState {
  text: string;
  color: string;
}

export function computeBadgeState(input: BadgeInput): BadgeState {
  if (input.hasAuthNeeded) {
    return { text: "!", color: "#dc2626" };
  }
  if (input.queueCount > 0) {
    return {
      text: input.queueCount > 9 ? "9+" : String(input.queueCount),
      color: "#f59e0b",
    };
  }
  return { text: "", color: "#000000" };
}
