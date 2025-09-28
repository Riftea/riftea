"use client";

import { useState } from "react";

export default function UploadField({ label = "Archivo", value, onChange, prefix = "products" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBusy(true);
      setErr("");
      const fd = new FormData();
      fd.append("file", f);
      fd.append("prefix", prefix);

      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo subir");

      onChange?.(data.path); // ← guardá este path en el estado del formulario
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm opacity-80">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="file"
          onChange={handleFile}
          disabled={busy}
          className="block w-full text-sm text-white file:mr-2 file:py-2 file:px-3
                     file:rounded-lg file:border-0 file:bg-white/10 file:text-white
                     hover:file:bg-white/20"
        />
        {busy && <span className="text-xs opacity-70">Subiendo…</span>}
      </div>
      {value && (
        <div className="text-xs opacity-80">
          Guardado como: <code className="bg-white/10 px-1 py-0.5 rounded">{value}</code>
        </div>
      )}
      {err && <div className="text-xs text-red-300">{err}</div>}
    </div>
  );
}
