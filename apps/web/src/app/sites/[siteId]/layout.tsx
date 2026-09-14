import { Shell } from "@/components/ui";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <Shell siteId={siteId}>{children}</Shell>;
}
