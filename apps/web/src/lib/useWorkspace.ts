"use client";

import { useCallback, useSyncExternalStore } from "react";

import { load, subscribe, update, type Workspace } from "./store";

const SERVER: Workspace = {
  version: 1, account: null, sites: [], runs: [], approvals: [], content: [], model: null, activity: [], visibility: [],
};

/**
 * The workspace, as React state.
 *
 * `useSyncExternalStore` rather than context so any screen can mutate the
 * store directly and every other mounted screen re-renders, without a
 * provider wrapping the tree.
 */
export function useWorkspace(): [Workspace, (mutate: (w: Workspace) => void) => void] {
  const workspace = useSyncExternalStore(subscribe, load, () => SERVER);
  const mutate = useCallback((fn: (w: Workspace) => void) => update(fn), []);
  return [workspace, mutate];
}

/** True once the browser has hydrated, so storage reads are safe. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
