// src/app/admin/mis-sorteos/page.jsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import MisSorteosContent from "./MisSorteosContent";

export const metadata = {
  title: "Mis sorteos | Admin",
  description: "Administra y comparte tus sorteos.",
};

function LoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <h2 className="text-lg font-semibold text-indigo-700">Cargando tus sorteos…</h2>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MisSorteosContent />
    </Suspense>
  );
}
