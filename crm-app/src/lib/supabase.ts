import { createClient } from "@supabase/supabase-js";

// Os dados passam pelo servidor do CRM (rota /sb), que confere a sessão e guarda a chave de serviço.
const fetchComSessao: typeof fetch = async (input, init) => {
  const resposta = await fetch(input, { ...init, credentials: "same-origin" });
  if (resposta.status === 401) window.location.href = "/prospeccao/login";
  return resposta;
};

export const supabase = createClient(`${window.location.origin}/sb`, "via-servidor", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: fetchComSessao },
});
