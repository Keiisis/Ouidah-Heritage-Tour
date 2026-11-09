import { verifierMaintenance } from "@/lib/serveur/maintenance-page";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await verifierMaintenance("FR");
  return children;
}
