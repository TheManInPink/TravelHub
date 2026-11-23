import Link from "next/link";
import { PlaneIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

// Layout des pages publiques de connexion et d'inscription : le logo, puis une carte
// centrée. Chaque page remplit la carte avec CardHeader et CardContent.

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-lg px-1 text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <PlaneIcon aria-hidden="true" className="size-6 text-primary" />
        TravelHub
      </Link>
      <Card className="w-full max-w-md">{children}</Card>
    </main>
  );
}
