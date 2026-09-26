import "./lab.css";

import { LabChrome } from "@/components/lab/chrome";

/**
 * Every page under /thymelab is the lab: its own dark theme, header and
 * footer. Keeping them under one layout is what makes moving the lab to its
 * own subdomain or domain later a matter of redirects, not a rebuild.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lab">
      <LabChrome>{children}</LabChrome>
    </div>
  );
}
