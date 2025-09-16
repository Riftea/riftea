import { Suspense } from "react";
import MisSorteosContent from "./MisSorteosContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Cargando tus sorteos…</div>}>
      <MisSorteosContent />
    </Suspense>
  );
}
