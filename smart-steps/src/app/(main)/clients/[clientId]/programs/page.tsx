import { redirect } from "next/navigation";

export default async function ProgramsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}?tab=programs`);
}
