import { WorkspaceSync } from "@/components/workspace-sync";

/**
 * The signed-in workspace.
 *
 * Nothing here blocks on the server. The sync component below runs once on
 * mount and does nothing at all when there is no account, which is why the
 * app opens at the same speed with or without one.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceSync />
      {children}
    </>
  );
}
