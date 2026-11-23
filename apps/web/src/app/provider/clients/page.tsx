import { Suspense } from "react";
import { ClientsClient } from "./ClientsClient";
import { fetchClientsInitial } from "./fetch-clients-initial";

export const dynamic = "force-dynamic";

export default async function ProviderClientsPage() {
  const { clients, error } = await fetchClientsInitial();
  return (
    <Suspense fallback={null}>
      <ClientsClient initialClients={clients} initialError={error} fromServer />
    </Suspense>
  );
}
