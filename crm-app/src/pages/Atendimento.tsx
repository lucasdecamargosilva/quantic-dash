import { useState } from "react";
import { useSearchParams } from "react-router-dom";

// Usa o proxy autenticado do prÃ³prio Quantic Dash. Um endereÃ§o 127.0.0.1 no
// navegador aponta para o computador do usuÃ¡rio e deixa o Atendimento offline.
const ATENDIMENTO_URL = "/prospeccao/";

export default function Atendimento() {
  const [params] = useSearchParams();
  const chatid = params.get("chatid");
  const url = ATENDIMENTO_URL + (chatid ? `?chatid=${encodeURIComponent(chatid)}` : "");
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0 bg-base">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-dim">
            Carregando conversasâ€¦
          </div>
        )}
        <iframe
          key={url}
          src={url}
          title="PL Atendimento"
          onLoad={() => setLoaded(true)}
          className="relative w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
