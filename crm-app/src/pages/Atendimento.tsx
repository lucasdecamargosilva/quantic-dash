import { useState } from "react";

const ATENDIMENTO_URL = "http://127.0.0.1:8781";

export default function Atendimento() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between gap-4 px-4 lg:px-8 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-edge-subtle)" }}
      >
        <div>
          <h1 className="text-[18px] font-bold text-bright">Chat de prospecção</h1>
          <p className="text-[11px] text-dim mt-0.5">
            Conversas do WhatsApp integradas às etapas do CRM
          </p>
        </div>
        <a
          href={ATENDIMENTO_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-cyan hover:text-bright transition-colors shrink-0"
        >
          Abrir em nova aba ↗
        </a>
      </div>

      <div className="relative flex-1 min-h-0 bg-base">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-dim">
            Carregando conversas…
          </div>
        )}
        <iframe
          src={ATENDIMENTO_URL}
          title="PL Atendimento"
          onLoad={() => setLoaded(true)}
          className="relative w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
