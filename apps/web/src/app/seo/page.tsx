import { DeskPage } from "@/components/desk-page";
import { deskByKey } from "@/lib/desks";

const desk = deskByKey("search")!;

export const metadata = {
  title: desk.headline,
  description: desk.lede,
  alternates: { canonical: "/seo" },
};

export default function Page() {
  return <DeskPage desk={desk} />;
}
