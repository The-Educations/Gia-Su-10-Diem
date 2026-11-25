import { useEffect, useRef, useState } from "react";

// A text field mirrored into the URL (?q=…). The field owns its own text so React never
// rewrites it while the user is typing: an IME (Telex/VNI) composes inside the field and a
// value that round-trips through the router mid-keystroke duplicates or drops letters.
// The URL follows after a short pause; a change made elsewhere (e.g. "Xóa bộ lọc") flows back in.
export function useUrlField(value: string, commit: (next: string) => void, delay = 250) {
  const [draft, setDraft] = useState(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const echoes = useRef(new Set<string>());

  // URL → field, ignoring the echo of what this field itself just wrote.
  useEffect(() => {
    if (echoes.current.delete(value)) return;
    setDraft(value);
  }, [value]);

  // Field → URL, after the user pauses.
  useEffect(() => {
    if (draft === value) return;
    const id = window.setTimeout(() => {
      echoes.current.add(draft);
      commitRef.current(draft);
    }, delay);
    return () => window.clearTimeout(id);
    // `value` is read only to skip a no-op; re-running on it would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delay]);

  return [draft, setDraft] as const;
}
