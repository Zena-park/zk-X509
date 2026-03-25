"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AdminContent from "@/components/AdminContent";

export default function ScopedAdminPage() {
  const params = useParams<{ address: string }>();
  const address = params.address;

  return (
    <>
      <div className="max-w-6xl mx-auto pt-24 px-8 pb-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors font-headline text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Services
        </Link>
      </div>
      <AdminContent />
    </>
  );
}
