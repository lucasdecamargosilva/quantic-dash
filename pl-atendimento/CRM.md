# PL Atendimento + Quantic Dash

Abra `painel.bat` e acesse http://localhost:8781. Na conversa, o bloco **Quantic Dash** mostra a etapa consultada no CRM. Os botões Interessado, Teste Catálogo — 7 dias, Fechou e Perdida salvam no CRM; o seletor permite escolher qualquer outra etapa. A interface só confirma depois de consultar o resultado salvo. Os filtros locais acompanham a etapa confirmada.

Conversas sem cadastro oferecem **Registrar no CRM**. A vinculação procura telefone e WhatsApp no CRM, normalizando formatação, DDI brasileiro e nono dígito. Mais de uma correspondência exige resolver a duplicidade no CRM, sem escolher um cadastro arbitrariamente.

## Entrada automática

A cada minuto, um processo independente procura mensagens recebidas com “Gostaria de saber mais sobre o Provou Catálogo”, “Gostaria de saber mais sobre o Provador Virtual” ou “Quero saber mais sobre o Provador Virtual”. Recupera também essas mensagens já armazenadas. Processa até 25 conversas por ciclo, incluindo novas tentativas após falhas. Conversas removidas da fila não são importadas automaticamente. Outras mensagens podem ser registradas pelo botão manual.

Um novo lead entra com origem Meta e etapa Meta; etapas locais anteriores Teste Grátis, Convertido e Perdido são preservadas. O cadastro manual sem mensagem reconhecida entra com origem WhatsApp e etapa Respondeu. Leads encontrados no CRM mantêm sua etapa e seus dados.

O schema atual exige Instagram. Para contatos sem Instagram, a integração usa a chave técnica determinística `whatsapp_<telefone normalizado>` e registra nas notas que o Instagram não foi informado. Essa chave garante que uma repetição após falha de rede não crie outro cadastro. Nome, telefone e mensagem de entrada são preservados. Não presume categoria, responsável ou perfil social.

## Configuração

Por padrão, reutiliza `../quantic-dash/crm-app/.env.production` somente no servidor Python. Nenhuma chave é enviada ao navegador pelo painel. Para outra instalação, defina `PL_CRM_ENV_FILE`; alternativamente, `PL_CRM_URL` e `PL_CRM_KEY`. As permissões existentes do Quantic Dash precisam permitir leitura e gravação em `leads` e `crm_lead_etapas`.

O vínculo persistente fica na tabela local `crm_links` do `painel.db`. “Testou e Saiu” segue o mesmo mecanismo do Quantic Dash: `stand_by` na tabela principal e a etapa específica em `crm_lead_etapas`. São operações separadas, como no CRM atual; se uma falhar, o painel mostra erro e permite tentar novamente.

O painel precisa estar em execução para registrar novas entradas. A captura mantém a janela existente de 14 dias e as últimas 60 mensagens por conversa; o cadastro automático depende de a mensagem de entrada estar no banco local. Não interpreta mensagens livres como anúncio.

## Verificação

Execute `python -m unittest test_crm_bridge -v`. Os testes usam SQLite em memória e um CRM simulado, sem enviar mensagens ou modificar leads reais.

Backup anterior à integração: `painel.pre-crm.py.bak`. Reinicie o painel depois de alterar o código.
