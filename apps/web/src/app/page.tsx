"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { fetcher, getToken, type Site } from "@/lib/api";
import { Loading } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const authed = typeof window !== "undefined" && !!getToken();
  const { data: sites, error } = useSWR<Site[]>(authed ? "/sites" : null, fetcher);

  useEffect(() => {
    if (!authed) {
      router.replace("/login");
      return;
    }
    if (!sites) return;
    // Straight to the work. A landing page between login and the dashboard
    // is a click nobody wants.
    router.replace(sites.length ? `/sites/${sites[0].id}` : "/onboarding");
  }, [authed, sites, router]);

  return (
    <div className="auth-shell">
      {error ? <div className="notice notice-bad">Could not load your sites.</div> : <Loading />}
    </div>
  );
}
