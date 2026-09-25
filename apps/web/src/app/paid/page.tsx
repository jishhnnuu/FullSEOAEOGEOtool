import { AdAccessTable } from "@/components/ad-access-table";
import { DeskPage } from "@/components/desk-page";
import { Sprig } from "@/components/sprig";
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
    <>
      <DeskPage
        desk={desk}
        extra={
          <section className="section">
            <h2 className="section-title">Where every platform stands.</h2>
            <p className="section-lede">
              You press Connect and log in on the platform&rsquo;s own site. No keys, ever. Tap a row for the detail.
            </p>
            <AdAccessTable />
          </section>
        }
      />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="paid" />
    </>
  );
}
