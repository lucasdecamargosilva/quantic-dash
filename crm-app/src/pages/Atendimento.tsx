import { useState } from "react";

// Usa o proxy autenticado do próprio Quantic Dash. Um endereço 127.0.0.1 no
// navegador aponta para o computador do usuário e deixa o Atendimento offline.
const ATENDIMENTO_URL = "/prospeccao/";

export default function Atendimento() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col overflow-hidden">
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
