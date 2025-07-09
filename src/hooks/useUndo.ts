import { useCallback, useRef, useState } from "react";

/**
 * Tiny undo stack for immutable state objects – stores *snapshots*
 */
export default function useUndo<T>(initial: T): [
  T,
  React.Dispatch<React.SetStateAction<T>>,
  { undo: () => void; push: (state: T) => void; canUndo: boolean }
] {
  const [state, setState] = useState<T>(initial);
  const history = useRef<T[]>([]);

  /** push current snapshot onto the stack */
  const push = useCallback((snapshot: T) => {
    history.current.push(JSON.parse(JSON.stringify(snapshot))); // deep-clone
  }, []);

  /** revert to last snapshot */
  const undo = useCallback(() => {
    if (history.current.length === 0) return;
    const prev = history.current.pop() as T;
    setState(prev);
  }, []);

  return [state, setState, { undo, push, canUndo: history.current.length > 0 }];
}
