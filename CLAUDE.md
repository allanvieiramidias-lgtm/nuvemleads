# CLAUDE.md — NuvemLeads

Mensageiro web privado para **exatamente duas pessoas**, com camada de bloqueio por PIN. Um administrador cria as pessoas e os PINs.

## Documentos de referência (ler antes de qualquer tarefa)
- `docs/handoff/DECISOES.md` — **decisões e correções; prevalece sobre os outros em caso de conflito**
- `docs/handoff/README.md` — telas, textos, estados, tokens, animações (fonte da verdade do design)
- `docs/handoff/ARQUITETURA.md` — stack, banco, API, tempo real, segurança
- `docs/handoff/HOSPEDAGEM_HOSTINGER.md` — deploy no VPS Hostinger
- `docs/handoff/prototipo/NuvemLeads.dc.html` — protótipo navegável (referência visual, não copiar código)

## Stack
Next.js 16 App Router (versões exatas em DECISOES §1) · TypeScript estrito · Tailwind v4 sobre os tokens do Nocturne · Radix (Dialog, DropdownMenu, Tooltip, Switch) · Phosphor icons · Drizzle ORM + PostgreSQL 16 · Socket.IO em `server.ts` · TanStack Query + Zustand · zod · argon2id · sharp · ffmpeg · Vitest · Playwright.

## Regras
- **Não expandir o escopo.** Proibido: grupos, stories, status, chamadas, stickers, GIFs, reações, localização, contatos, busca, editar/encaminhar mensagens, push, analytics, permissões, cadastro público.
- Interface em **português do Brasil**; use os textos do README literalmente.
- **Só tokens** (`var(--color-*)`, `--nl-*`, escala de espaço/raio/sombra). Nada de hex solto. Títulos no máximo peso 500. Botão primário é contorno, nunca preenchido. Linhas longas esmaecem nas pontas.
- Mobile-first de verdade: desktop (coluna de 780px), tablet (largura total), mobile (100dvh, safe-area).
- Toda entrada validada com zod no servidor. Respostas de API com `Cache-Control: no-store`.
- PIN e senha: argon2id, nunca logados, nunca retornados, PIN nunca exibido em texto aberto.
- Bloqueio: ao bloquear, desmontar a conversa e limpar o cache do cliente; servidor responde 423 com sessão bloqueada. Nunca guardar mensagens em localStorage/IndexedDB/service worker.
- O admin nunca acessa conteúdo de mensagens nem mídia.
- Máximo de 2 usuários ativos (validar em transação). A conversa pertence ao par de pessoas (DECISOES §3).
- Nunca instalar dependências com `@latest`; usar as versões de DECISOES §1, exatas.
- Respeitar `prefers-reduced-motion`.
- Cada etapa: testes passando (`npm test`, `npx playwright test`) e `npm run build` limpo antes de concluir.

## Comandos
- `npm run db:dev` (Docker) — Postgres local; sem Docker, um Postgres 16 com usuário `nuvem`/`nuvem-dev` e banco `nuvemleads`
- `npm run dev` — Next + Socket.IO
- `npm run db:generate` (após mudar `src/db/schema.ts`) · `npm run db:migrate` · `npm run db:seed` (`SEED_DEMO=true` para dados de exemplo)
- `npm test` roda unidade + integração; a integração usa um Postgres real no banco `nuvemleads_test` (criado e migrado sozinho; `TEST_DATABASE_URL` para mudar)
- `npx playwright test` · `npm run build` · `npm run lint` · `npm run typecheck`
