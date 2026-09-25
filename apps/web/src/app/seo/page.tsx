import { DeskPage } from "@/components/desk-page";
import { Sprig } from "@/components/sprig";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("search")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/seo" },
};

export default function Page() {
  return (
    <>
      <DeskPage desk={desk} />
      {/* The mascot, on trial here only. Delete this line and components/sprig to remove him. */}
      <Sprig />
    </>
  );
}
