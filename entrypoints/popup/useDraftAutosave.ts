import { useEffect, useRef } from "preact/hooks";
import { type Draft, draftStore } from "../../storage";

interface Args {
  domain: string;
  scope: string;
  state: Draft;
}

export function useDraftAutosave({ domain, scope, state }: Args) {
  const lastSerialized = useRef<string>("");

  useEffect(() => {
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    const handle = setTimeout(() => {
      // Only save if there's meaningful content (avoid junk drafts of empty composers)
      if (state.content || state.name || state.bookmarkOf || state.inReplyTo) {
        draftStore().save(domain, scope, state).catch(console.error);
      }
    }, 1000);
    return () => clearTimeout(handle);
  }, [state, domain, scope]);
}
