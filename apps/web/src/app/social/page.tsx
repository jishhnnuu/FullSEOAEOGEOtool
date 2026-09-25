import { DeskPage } from "@/components/desk-page";
import { Sprig } from "@/components/sprig";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("social")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/social" },
};

export default function Page() {
  return (
    <>
      <DeskPage desk={desk} />
      {/* The mascot crew. Delete this line and components/sprig to remove them. */}
      <Sprig crew="social" />
    </>
  );
}
