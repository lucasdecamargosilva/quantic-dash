# PL Atendimento

Painel local de atendimento comercial da Provou Levou, integrado ao WhatsApp e ao CRM do Quantic Dash.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha `UAZAPI_TOKEN` e `GEMINI_KEY`.
3. Se o Quantic Dash não estiver na pasta irmã esperada, preencha `PL_CRM_URL` e `PL_CRM_KEY`.
4. Execute `painel.bat` no Windows ou `python painel.py`.
5. Abra `http://localhost:8781`.

O banco local, as conversas, os logs e as chaves ficam fora do Git.

## Publicação no Quantic Dash

O Dockerfile inicia o painel junto com o servidor principal e o publica em
`/prospeccao/`, protegido por uma tela de login própria. Configure `PROSPECCAO_USER` e
`PROSPECCAO_PASSWORD_HASH` (SHA-256 hexadecimal da senha) no ambiente do serviço.
Para dar acesso individual a outras pessoas sem substituir o login existente,
configure também `PROSPECCAO_USERS_JSON` como um objeto JSON que associa cada
usuário ao hash SHA-256 de sua senha, por exemplo
`{"dione":"<hash SHA-256 da senha individual>"}`. Não salve senhas nem hashes no Git.
Após um reset do usuário `lucas`, o serviço lê o hash de
`/data/prospeccao/lucas-auth.json` (`hash` e `invalidBefore` em milissegundos),
que prevalece sobre `PROSPECCAO_PASSWORD_HASH`. O arquivo fica no volume
persistente e revoga apenas as sessões do Lucas anteriores ao reset.
Configure `PROSPECCAO_SESSION_SECRET` com uma chave aleatória longa para manter as
sessões válidas após reinícios do serviço. Sem ela, a chave muda a cada reinício.
Sem esses campos a rota permanece fechada. O serviço Python continua acessível
apenas dentro do container. Configure `UAZAPI_TOKEN`, `GEMINI_KEY`, `PL_CRM_URL`
e `PL_CRM_KEY` como variáveis do serviço no EasyPanel. Monte um volume persistente
em `/data/prospeccao` e importe o `painel.db` local antes de liberar o acesso, para
preservar histórico, estados dos leads e vínculos com o CRM. O arquivo de vídeo
`midias/provou-catalogo.mp4` é incorporado à imagem; as mídias recebidas podem ser
armazenadas novamente em cache.

## Atualização em tempo real

`live_events.py` mantém uma conexão SSE de saída com a UAZAPI. Quando uma mensagem chega, o servidor grava no SQLite e publica imediatamente um evento local em `/api/events`; a tela atualiza sem esperar polling. O token fica no servidor. Há reconexão automática, deduplicação e polling apenas como recuperação. `/api/sync` informa o estado da conexão e os contadores.
