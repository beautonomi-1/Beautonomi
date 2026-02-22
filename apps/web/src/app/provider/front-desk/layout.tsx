import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Front Desk | Beautonomi Provider",
  description: "Manage today's appointments, check-ins, and payments",
};

export default function FrontDeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
