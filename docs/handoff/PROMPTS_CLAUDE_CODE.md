# NuvemLeads — Sequência de prompts para o Claude Code

Como usar:
0. **Leia `DECISOES.md` — ele prevalece sobre os outros documentos.**
1. Crie um repositório vazio `nuvemleads` e copie para dentro dele **esta pasta inteira** como `docs/handoff/` e o arquivo `CLAUDE.md` para a raiz.
2. Abra o Claude Code na raiz do repositório.
3. Rode os prompts **um por vez, na ordem**. Ao fim de cada etapa, confira os critérios de aceite, rode os testes e faça commit antes de seguir.
4. Se algo sair diferente do design, aponte a seção exata do `docs/handoff/README.md` no pedido de correção.

---

## Etapa 0 — Projeto base ✅ concluída em 11/10/2026
```
Leia CLAUDE.md e todos os arquivos em docs/handoff/ (DECISOES.md primeiro, depois README.md, ARQUITETURA.md, HOSPEDAGEM_HOSTINGER.md).
Crie o projeto conforme ARQUITETURA.md §1 e §2 com as versões exatas de DECISOES §1: Next.js 16 (App Router, src/, TypeScript estrito), Tailwind v4, ESLint + Prettier, Vitest, Playwright, Drizzle ORM com PostgreSQL (DECISOES §17), e um server.ts que sobe Next e Socket.IO no mesmo http.Server (script de build compila server.ts para dist/server.js com tsup).
Adicione docker-compose.dev.yml só com Postgres para desenvolvimento local e o .env.example de ARQUITETURA.md §10.
Ainda não crie telas. Mostre a árvore final e os comandos para rodar.
```
Aceite: `npm run dev` abre uma página vazia; `npm run build` passa; Postgres local sobe.

## Etapa 1 — Tokens e componentes de UI ✅ concluída em 11/10/2026
```
Copie docs/handoff/tokens/nocturne.css e nuvemleads.css para src/styles/tokens/ e importe em globals.css na ordem de DECISOES §2 (Tailwind primeiro, nocturne em layer(components)). A Inter já está configurada via next/font/local (DECISOES §18).
Crie os componentes de src/components/ui e src/components/brand seguindo README.md §4.2 (PIN Input), §4.11 e §8, usando somente tokens: Button (primary/secondary/ghost, loading, disabled, block), IconButton, Input (com estado de erro e mensagem), PinInput (6 caixas, input invisível, estados idle/focus/filled/error/success/blocked, tremor), Avatar (tons accent/neutral, tamanhos, foto ou iniciais, ponto de presença com pulso), Badge, Toast (provider + hook), Modal (Radix Dialog), Dropdown (Radix), Tooltip (Radix), Switch (Radix), Segmented, Logo e LogoMark (SVG de docs/handoff/prototipo/assets/favicon.svg).
Crie uma página /dev/ui (só em desenvolvimento) mostrando todos os componentes e variantes, igual à tela "Design system" do protótipo docs/handoff/prototipo/NuvemLeads.dc.html.
Respeite prefers-reduced-motion. Foco visível = outline 2px accent.
```
Aceite: `/dev/ui` bate visualmente com a tela "Design system" do protótipo.

## Etapa 2 — Banco e seed ✅ concluída em 12/10/2026
```
Implemente src/db/schema.ts (Drizzle) com o modelo de ARQUITETURA.md §3 (com Conversation, DECISOES §3) e gere a migração (npm run db:generate).
Complete scripts/seed.ts: Settings padrão (5 min, true, true) e o admin a partir de ADMIN_SEED_*. Com SEED_DEMO=true, crie também Maria Clara (tom ACCENT, PIN 123456) e Allan Souza (tom NEUTRAL, PIN 246810) com slugs aleatórios e as 9 mensagens de exemplo do README §7 (sem mídia real, exceto a foto docs/handoff/prototipo/assets/photo.jpg copiada para UPLOAD_DIR).
Use src/db/index.ts (já existe) e crie src/lib/auth (hash argon2id, tokens opacos com sha256 no banco, helpers de cookie __Host-).
Escreva testes Vitest para a regra de no máximo 2 usuários ativos, para a validação de PIN fraco e para a escolha da conversa do par ativo.
```

## Etapa 3 — Login do administrador ✅ concluída em 12/10/2026
```
Implemente README.md §4.5, a tela de redefinir senha (DECISOES §13) e as rotas /api/admin/login, logout, password/forgot e password/reset de ARQUITETURA.md §5, com rate limit de §7 e envio de e-mail via nodemailer (SMTP_*).
Estados obrigatórios: erro "Não foi possível entrar. Verifique seus dados.", botão com loading "Entrando…", link "Esqueci minha senha" (tela com envio e confirmação genérica).
Proteja /admin/* com proxy.ts (Next 16) (redireciona para /admin/login sem sessão).
Adicione teste Playwright do login com erro e com sucesso.
```

## Etapa 4 — Painel, Usuários, Criar/Editar, Configurações ✅ concluída em 12/10/2026
```
Implemente README.md §4.6 a §4.10 e as rotas admin de ARQUITETURA.md §5.
- AdminShell com sidebar (desktop/tablet) e pílulas (mobile).
- Painel: 4 cards e Atividade recente (sem conteúdo de mensagens).
- Usuários: medidor de vagas, lista, Editar, Desativar com modal, Ativar com regra de 2 ativos.
- Novo/Editar: foto, nome, PIN/confirmar (type=password, nunca exibido), status; todas as validações e textos do README; modal de confirmação ao alterar PIN; tela "Usuário criado"; destaque da linha alterada; botão "Copiar link" do link pessoal.
- Configurações: seg de tempo, dois switches, conta, modal "Alterar senha".
- Trocar PIN ou desativar derruba as sessões da pessoa (ARQUITETURA §3).
Use toasts com os textos do README. Inclua "Gerar novo link" e o aviso "Liberar tentativas" (DECISOES §8 e §13). Teste Playwright do fluxo admin completo de ARQUITETURA.md §11.
```

## Etapa 5 — Acesso do participante e PIN ✅ concluída em 12/10/2026
```
Implemente README.md §4.1 e §4.2 e as rotas /api/public/u/:slug, /api/auth/pin, /api/auth/logout e /api/me.
- A tela / só aparece se PUBLIC_PICKER=true; senão usa o cookie nl_last ou pede o link pessoal (DECISOES §13).
- PinInput com todos os estados; 3 erros → espera de 15 s com contagem; rate limit no servidor (DECISOES §8); aviso de PIN alterado (DECISOES §9).
- Cookie de sessão conforme ARQUITETURA §6 e regra de reabrir de DECISOES §7.
- Sucesso → /chat com estado de loading (esqueleto).
```

## Etapa 6 — Conversa: texto e tempo real ✅ concluída em 13/10/2026
```
Implemente README.md §4.3 (sem anexos ainda), ARQUITETURA.md §8 e DECISOES §6, §10 e §11.
- ChatHeader (presença, digitando, visto por último, Bloquear, menu de sessão), OfflineBanner, MessageList com paginação reversa (cursor), DateDivider (Hoje/Ontem/data), MessageGroup, MessageBubble (todos os status), TypingIndicator, EmptyState, LoadingState, ErrorState.
- Composer: textarea com auto-altura (até 5 linhas), Enter envia, Shift+Enter quebra, troca microfone↔enviar com animação, EmojiPicker com 24 emojis.
- Envio otimista com clientId (uuid), ack, delivered, read; fila offline reenviada ao reconectar; "Tentar novamente".
- Rolagem automática ao fim quando chega mensagem (se o usuário estiver perto do fim).
- Layout responsivo do README §5 (desktop 780px central, tablet largura total, mobile tela cheia com 100dvh e safe-area).
Teste Playwright com dois contextos de navegador (Allan e Maria) trocando mensagens.
```

## Etapa 7 — Anexos, upload e mídia ✅ concluída em 13/10/2026
```
Implemente o resto do README.md §4.3 (imagem, vídeo, áudio, arquivo, menu de anexo, câmera no mobile, gravação com MediaRecorder, modal de preview) e ARQUITETURA.md §5 (uploads/media), §7 (uploads) e §9 (estados).
- POST /api/uploads por streaming (busboy) com limites de DECISOES §12, conversão de vídeo HEVC, detecção real de tipo, sharp para imagens (sem EXIF, 2560px, miniatura 600px), ffprobe/ffmpeg para duração e capa.
- Cliente usa XMLHttpRequest para a barra de progresso; estados preparando/enviando/concluído/erro com textos do README.
- GET /api/media/:id com Range; download com Content-Disposition.
- AudioPlayer customizado (play/pause, seek, tempo).
- MediaViewer: imagem com zoom 100–300% e baixar; vídeo com play/pause, timeline, volume, tela cheia; Esc fecha.
- Erros de tamanho/formato via toast com os textos do README.
```

## Etapa 8 — Camada de bloqueio ✅ concluída em 13/10/2026
```
Implemente README.md §4.4 e §5 (tabela de gatilhos), ARQUITETURA.md §7 (Bloqueio) e DECISOES §4, §5, §6 e §7.
- LockController: visibilitychange, blur com tolerância de 1,5 s (não bloquear enquanto o seletor de arquivo/câmera estiver aberto), inatividade com o tempo de Settings, botão Bloquear, BroadcastChannel entre abas, evento session:locked do servidor.
- Ao bloquear: desmontar a conversa, queryClient.clear(), revogar blob URLs, pausar mídia, sendBeacon /api/session/lock, desconectar o socket da sala.
- LockScreen em tela cheia (não modal) com motivo e horário; desbloqueio via /api/session/unlock com animação de sucesso; recarrega mensagens do servidor.
- Servidor: rotas de mensagens/mídia retornam 423 com sessão bloqueada; heartbeat de 30 s aplica bloqueio por inatividade.
Testes Playwright: bloqueio por aba, por inatividade (relógio falso), manual; 423 em /api/messages enquanto bloqueado.
```

## Etapa 9 — Acabamento
```
Revise todas as telas contra o protótipo docs/handoff/prototipo/NuvemLeads.dc.html e a tela "Estados" dele, em 1440px, 834px e 390px.
- Confira cada estado do README (loading, vazio, erro, offline, enviando, enviada, falhou, upload em andamento, upload falhou, bloqueada, PIN incorreto, usuário offline).
- Teclado virtual no mobile: meta viewport com interactive-widget=resizes-content e ajuste com visualViewport para o composer e a última mensagem ficarem visíveis.
- Acessibilidade: rótulos em todos os botões de ícone, aria-live para toasts e mensagens novas, ordem de foco nos modais, contraste.
- Rode @axe-core/playwright nas telas principais e corrija.
- Favicons (svg, 180px, 512px) e manifest mínimo, título fixo "NuvemLeads".
Não adicione nenhuma funcionalidade fora do README.
```

## Etapa 10 — Segurança e produção
```
Aplique ARQUITETURA.md §7 e DECISOES §14 (CSP com nonce em proxy.ts, CSRF por Origin, cookies, rate limits) e crie /api/health.
Crie Dockerfile, docker-compose.yml e Caddyfile exatamente como HOSPEDAGEM_HOSTINGER.md §3, e o workflow .github/workflows/deploy.yml de §5 (imagem no GHCR, DECISOES §15).
Rode o build da imagem localmente e me dê o checklist de HOSPEDAGEM_HOSTINGER.md §9 com o que já foi verificado e o que depende do servidor.
```

---

## Dicas para as sessões
- Peça "mostre o plano antes de editar" nas etapas 6, 7 e 8 (as maiores).
- Se o contexto ficar grande, comece uma sessão nova; o `CLAUDE.md` mantém as regras.
- Para corrigir visual, mande print + "compare com a tela X do protótipo e com README §4.Y".
