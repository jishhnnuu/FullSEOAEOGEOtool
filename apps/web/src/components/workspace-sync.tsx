"use client";

import { useEffect, useRef } from "react";

import { useSession } from "@/lib/session";
import { pullWorkspace, pushWorkspace } from "@/lib/sync";
import { subscribe } from "@/lib/store";

/**
 * Two lines of housekeeping, mounted once.
 *
 * On sign-in, pull the account's copy down if this browser has nothing of its
 * own. After that, push changes up, batched, because a workspace mutates on
 * every keystroke in some screens and a request per keystroke would be absurd.
 *
 * Signed out, or with no server, this does nothing and costs nothing.
 */
export function WorkspaceSync() {
  const { session } = useSession();
  const pulled = useRef(false);

  const signedIn = Boolean(session.user);

  useEffect(() => {
    if (!signedIn || pulled.current) return;
    pulled.current = true;
    void pullWorkspace();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void pushWorkspace(), 4000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [signedIn]);

  return null;
}
