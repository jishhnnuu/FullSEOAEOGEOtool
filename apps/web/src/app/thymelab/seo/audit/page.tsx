import { SeoWorkbench } from "@/components/lab/seo-workbench";

export const metadata = {
  title: "Check any website's SEO",
  description:
    "Paste any website and watch it get read, checked and fixed on paper: coverage first, four scores (unmeasured ones labelled), and every problem grouped with its fix written out. Free, in your browser.",
  alternates: { canonical: "/thymelab/seo/audit" },
};

export default function SeoAuditPage() {
  return <SeoWorkbench />;
}
