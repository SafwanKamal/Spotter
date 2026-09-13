import CompetitionWorkspace from "@/components/competition-workspace";
export const metadata = { title: "Gym competition — Spotter" };
export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompetitionWorkspace id={id} />;
}
