import { useCallback, useState } from "preact/hooks";
import type { CreateOptions, PostType } from "../../core/types";

export interface ComposerState extends CreateOptions {
  type: PostType;
}

const initial: ComposerState = {
  type: "note",
  content: "",
  category: [],
  syndicateTo: [],
};

export function useComposerState(seed?: Partial<ComposerState>) {
  const [state, setState] = useState<ComposerState>({ ...initial, ...seed });

  const patch = useCallback((delta: Partial<ComposerState>) => {
    setState((prev) => ({ ...prev, ...delta }));
  }, []);

  const setType = useCallback(
    (type: PostType) => {
      patch({ type });
      // Quote convention: pre-fill blockquote scaffold if empty
      if (type === "quote" && !state.content) {
        patch({ content: "> \n\n" });
      }
    },
    [patch, state.content],
  );

  const reset = useCallback(() => setState(initial), []);

  return { state, patch, setType, reset, setState };
}
