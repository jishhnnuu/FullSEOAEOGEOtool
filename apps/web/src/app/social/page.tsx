import { DeskPage } from "@/components/desk-page";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("social")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/social" },
};

export default function Page() {
  return <DeskPage desk={desk} />;
}
