import { useState } from "react";

// Reaproveita o painel de atendimento (mesmo proxy autenticado /prospeccao/),
// mas abre a tela de edição das mensagens prontas (?view=mensagens).
const MENSAGENS_URL = "/prospeccao/?view=mensagens";

export default function MensagensPersonalizadas() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0 bg-base">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-dim">
            Carregando mensagens…
          </div>
        )}
        <iframe
          src={MENSAGENS_URL}
          title="Mensagens Personalizadas"
          onLoad={() => setLoaded(true)}
          className="relative w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
