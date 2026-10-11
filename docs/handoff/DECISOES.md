# NuvemLeads — Decisões e correções (revisão de 11/10/2026)

> **Este arquivo prevalece** sobre README.md, ARQUITETURA.md, HOSPEDAGEM_HOSTINGER.md e PROMPTS_CLAUDE_CODE.md quando houver conflito.
> Os trechos afetados nesses arquivos já foram ajustados e apontam para cá com "ver DECISOES §N".

## 1. Versões fixadas

Nunca instalar com `@latest`. Versões exatas no `package.json` (sem `^`):

| Pacote | Versão | Observação |
|---|---|---|
| next | 16.4.0 | Next 15 está só em manutenção. No 16: `middleware.ts` virou `proxy.ts` (roda em Node, pode usar Prisma); `params`/`cookies()` são assíncronos; Turbopack é o padrão. |
| react / react-dom | 19.3.0 | |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | Substitui o Prisma (§17). |
| pg | 8.23.1 | Driver do Postgres. |
| typescript | 5.9.3 | O TypeScript 7 ainda não é suportado por todas as ferramentas. |
| eslint / eslint-config-next | 9.39.5 / 16.4.0 | |
| vitest / @playwright/test | 5.0.3 / 1.64.0 | |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | |
| socket.io / socket.io-client | 4.8.4 | |
| @node-rs/argon2 | 2.2.2 | |
| sharp | 0.35.5 | |
| Node | 22 LTS | |

## 2. Tokens com Tailwind (corrige um bug que apagava o tema)

Testado no Chromium: importando `nocturne.css` e `nuvemleads.css` **antes** do Tailwind, o bloco `@theme` gera `--color-bg: var(--color-bg)` (referência circular) fora de camada, e o fundo, superfícies, raios e sombras ficam vazios; a escala de cinzas do Nocturne é trocada pela do Tailwind.

Ordem correta em `globals.css` (também testada):
```css
@import "tailwindcss";
@import "./tokens/nocturne.css" layer(components);
@import "./tokens/nuvemleads.css";
```
Com `nocturne.css` em `layer(components)`, as classes utilitárias do Tailwind também conseguem ajustar `.btn`, `.input` etc. (fora de camada elas sempre perdiam).

## 3. Histórico da conversa pertence ao par de pessoas

- Nova tabela `Conversation { id, userAId, userBId (ids ordenados), createdAt }` com `@@unique([userAId, userBId])`. `Message.conversationId` obrigatório.
- A conversa exibida é a do par **ativo** atual. Se o admin trocar uma das pessoas, a nova dupla começa com conversa vazia. A conversa antiga fica guardada e invisível; volta a aparecer se a mesma dupla for reativada.
- Mídia segue a mesma regra: `/api/media/:id` só autoriza participantes da conversa da mensagem.
- Contadores e "Atividade recente" do painel: só da conversa atual.

## 4. Bloqueio durante câmera, galeria e gravação

No celular, abrir o seletor de arquivo ou a câmera dispara `visibilitychange → hidden`, o que bloquearia e perderia o arquivo escolhido.

- `LockController.suspend('picker')` antes de abrir o `<input type="file">`/câmera; `resume()` no evento `change` ou `cancel` do input, ou ao voltar o foco.
- **Durante a suspensão, a conversa fica coberta pelo véu de privacidade** (§5), mas não é desmontada nem limpa. Ao voltar com o arquivo, o véu sai sem pedir PIN e o modal de preview abre.
- A suspensão dura no máximo **3 minutos**. Passou disso → bloqueio normal (motivo `tab`), o arquivo é descartado.
- Gravação de áudio não suspende o bloqueio: sair da aba durante a gravação descarta a gravação e bloqueia.

## 5. Véu de privacidade síncrono

O alternador de apps do celular e a prévia de abas do Chrome capturam a tela no instante em que a página sai de vista, antes de o React redesenhar.

- Em `visibilitychange`, `pagehide`, `blur` e no botão Bloquear, o primeiro passo é síncrono: `document.documentElement.dataset.veil = "on"`, e o CSS global esconde `#chat-root` (`visibility: hidden`) e mostra o fundo da tela de bloqueio. Só depois vem o desmonte pelo React.
- No `blur` (tolerância de 1,5 s), o véu entra **na hora**; se o foco voltar antes de 1,5 s, o véu sai sem bloquear.

## 6. Várias abas

Uma aba ativa por pessoa. Abrir `/chat` numa segunda aba assume a conversa; a primeira mostra "A conversa está aberta em outra aba." com o botão "Usar esta aba" (sem conteúdo). Bloquear continua valendo para todas as abas (`BroadcastChannel`).

## 7. "Exigir PIN ao reabrir"

Cookie de sessão sem `Max-Age` não é confiável (o Chrome restaura, e no celular o navegador quase nunca fecha). Regra nova: **todo carregamento completo de `/chat` começa bloqueado** (motivo `REOPEN`), exceto o primeiro carregamento logo após digitar o PIN. O servidor marca `UserSession.fresh = true` no sucesso do PIN e consome no primeiro `GET /api/me`. Recarregar a página pede o PIN. Com a opção desligada, a sessão volta desbloqueada (até o teto de 12 h).

## 8. Tentativas de PIN sem trancar a pessoa de fora

Substitui "20 erros em 24 h bloqueia o usuário" (qualquer um com o link poderia trancar a pessoa):
- Por `userId + IP`: 3 erros → 15 s; 5 erros em 15 min → 15 min.
- Por `userId` (todos os IPs): espera progressiva 30 s, 1, 2, 4… até 15 min entre tentativas depois de 10 erros em 24 h. Nunca bloqueio permanente.
- Com 10+ erros em 24 h, o Painel mostra o aviso "Muitas tentativas de PIN para Maria" com o botão "Liberar tentativas" (zera os contadores daquela pessoa).

## 9. Transparência sobre o admin

O admin não tem rota que mostre mensagens, mas pode trocar o PIN de alguém. Para que isso nunca passe despercebido: quando o PIN é trocado pelo admin, a tela de PIN da pessoa mostra uma vez "Seu PIN foi alterado pelo administrador." (`--nl-warning`). As mensagens ficam guardadas sem criptografia no servidor; isso deve ser dito às duas pessoas.

## 10. Tempo real ao bloquear (versão única)

- Ao bloquear, o cliente emite `session:locking` e desconecta o socket. O handshake **recusa** sessões bloqueadas ou expiradas.
- Pessoa bloqueada aparece como offline para a outra (com "Visto por último").
- Revogação (PIN trocado, usuário desativado) é percebida no desbloqueio: `POST /api/session/unlock` responde `401 REVOKED` → volta para `/u/<slug>`. Se a pessoa estiver desbloqueada, recebe `session:revoked` pelo socket.

## 11. Status "entregue"

Além do `message:delivered` pelo socket, `GET /api/messages` marca como entregues as mensagens da outra pessoa que ele retorna e emite `message:status`. Assim, o que chega depois de um desbloqueio também vira "entregue".

## 12. Vídeo e limites de upload

- Limites: imagens, áudios e arquivos **25 MB**; vídeos **100 MB** (25 MB ≈ menos de 1 min de vídeo de celular). Caddy: `max_size 101MB`. Textos de erro: "O arquivo excede o limite de 25 MB." / "O vídeo excede o limite de 100 MB."
- Vídeo que não for H.264/VP8/VP9 (ex.: HEVC do iPhone) é convertido no servidor para MP4 H.264/AAC com `ffmpeg` (preset `veryfast`, máx. 1080p). Enquanto converte, a bolha mostra "Processando vídeo…" no mesmo estilo do Upload Progress; `Attachment.status = PENDING` até terminar. Fila de 1 conversão por vez.
- Upload gravado direto em disco por streaming (`busboy`), contando bytes e abortando no limite. (`bodySizeLimit` do Next não vale para Route Handlers.)

## 13. Telas e caminhos que faltavam

- `/admin/redefinir-senha?token=…`: campos "Nova senha" e "Confirmar senha" (mín. 10), sucesso "Senha alterada. Entre com a nova senha." → `/admin/login`. Token inválido/expirado: "Este link expirou. Peça um novo." + link para "Esqueci minha senha".
- Recuperar o link pessoal: após o PIN correto, grava o cookie `nl_last` (só o slug, 180 dias, `SameSite=Strict`). Em `/` com `PUBLIC_PICKER=false`: se houver `nl_last`, redireciona para `/u/<slug>`; senão, mostra "Abra o link pessoal que o administrador enviou para você."
- Admin → Usuários → Editar: botão "Gerar novo link" (invalida o anterior, modal de confirmação) e "Copiar link".

## 14. Segurança HTTP

- CSP com **nonce por requisição**, gerado em `proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'unsafe-inline'` (estilos embutidos do Radix e do Next), `img-src 'self' blob: data:`, `media-src 'self' blob:`, `connect-src 'self' wss://<dominio>`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`. Em desenvolvimento, acrescentar `'unsafe-eval'`. (A CSP antiga, só com `default-src 'self'`, impedia o Next de carregar.)
- Cookies `__Host-` só em produção; em desenvolvimento, `nl_user`/`nl_admin` sem o prefixo (o WebKit do Playwright recusa `Secure` em http://localhost).
- `proxy.ts` só protege rotas e aplica a CSP; a validação real da sessão fica nos layouts e nas rotas de API.

## 15. Deploy

- Senha do Postgres com `openssl rand -hex 32` (o base64 pode gerar `/` e `+`, que quebram a `DATABASE_URL`).
- A imagem é gerada no **GitHub Actions** e publicada no GitHub Container Registry (privado). O VPS só faz `docker compose pull && up -d`. Vantagens: o servidor não precisa de chave para o repositório nem de memória para o build; o **KVM 1** passa a bastar para duas pessoas (o KVM 2 continua sendo boa folga para conversão de vídeo).
- `Dockerfile` com `COPY --chown`, só dependências de produção na imagem final, `prisma migrate deploy` no início.

## 16. Correções de referência

- ARQUITETURA §11: "README §26 do briefing" → os fluxos estão listados ali mesmo.
- PROMPTS Etapa 4: "README §11 de ARQUITETURA" → `ARQUITETURA.md §11`.

## 17. Drizzle no lugar do Prisma (decidido em 11/10/2026)

O Prisma precisa baixar um motor próprio de `binaries.prisma.sh` na instalação, no build e na migração. Trocamos por **Drizzle ORM** (TypeScript puro, sem binários):
- Esquema em `src/db/schema.ts` (mesmas tabelas, colunas e regras de ARQUITETURA §3, que segue valendo como modelo de dados; nomes de coluna em `snake_case`).
- Cliente em `src/db/index.ts` (`drizzle-orm/node-postgres` + `pg`).
- Migrações: `npm run db:generate` (drizzle-kit gera SQL em `drizzle/`, que vai para o git) e `npm run db:migrate`. Em produção: `node dist/migrate.js`. Seed: `npm run db:seed` / `node dist/seed.js`.
- Transação da regra de 2 ativos: `db.transaction(..., { isolationLevel: "serializable" })` ou `SELECT … FOR UPDATE` com `.for("update")`.

## 18. Fonte hospedada no app

Inter é servida pelo próprio app (`next/font/local`, arquivos em `src/app/fonts/`, licença OFL incluída). O `@import` do Google Fonts no topo de `nocturne.css` foi removido da cópia em `src/styles/tokens/`. Nenhuma chamada a servidores do Google: mais privacidade e CSP mais simples.

## 19. Ambiente

`NODE_ENV` não vai no `.env` (o servidor carrega o `.env` com dotenv; um `NODE_ENV=development` ali faria a produção subir em modo dev). Quem define é `npm start`, o `Dockerfile` e o `npm run dev`.
