import { Oracular } from "@/components/sportsdesk";
import { getBoard, today, validDate } from "@/lib/providers";
import { demoBoard } from "@/lib/demo";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const date =
    typeof query.date === "string" && validDate(query.date)
      ? query.date
      : today();
  const board = query.mode === "demo" ? demoBoard(date) : await getBoard(date);
  return (
    <Oracular
      initialBoard={board}
      initialDate={date}
      initialLeague={
        typeof query.league === "string" ? query.league : "All sports"
      }
      initialView={typeof query.view === "string" ? query.view : "Overview"}
      initialSearch={typeof query.q === "string" ? query.q : ""}
    />
  );
}
