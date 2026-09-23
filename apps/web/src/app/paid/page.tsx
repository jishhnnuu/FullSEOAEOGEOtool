import { DeskPage } from "@/components/desk-page";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("paid")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/paid" },
};

export default function Page() {
  return <DeskPage desk={desk} />;
}
