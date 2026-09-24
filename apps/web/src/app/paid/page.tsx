import { AdAccessTable } from "@/components/ad-access-table";
import { DeskPage } from "@/components/desk-page";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("paid")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/paid" },
};

/*
 * The one desk whose availability is not entirely ours to decide.
 *
 * Every advertising network reviews the software that writes to it, because
 * that software spends other people's money. So this page carries a table the
 * other desk pages do not: both halves of the access model, per platform,
 * including our own position in each queue. Publishing that is uncomfortable
 * and is the point. A client told the truth about a six-week Meta review does
 * not later discover it.
 */

export default function Page() {
  return (
    <DeskPage
      desk={desk}
      extra={
        <section className="section section-tight">
          <h2 className="section-title small-title">Every platform, and exactly where it stands</h2>
          <p className="section-lede">
            You press Connect and log in on the platform&rsquo;s own site. You never type a key, and you can
            withdraw the permission from your own account settings without telling us. What differs per platform
            is our side: each network reviews the software that writes to it, and those reviews are the reason a
            row below says in review rather than connect now.
          </p>
          <AdAccessTable />
        </section>
      }
    />
  );
}
