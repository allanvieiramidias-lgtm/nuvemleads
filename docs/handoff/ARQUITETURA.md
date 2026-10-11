# NuvemLeads — Arquitetura técnica

Documento de referência para implementar o MVP. Complementa o `README.md` (design e comportamento). **`DECISOES.md` prevalece em caso de conflito.**

## 1. Decisões principais

| Tema | Escolha | Motivo |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript estrito** | Front e API no mesmo projeto, SSR para as telas de acesso. Versões exatas: DECISOES §1 |
| Estilo | **Tailwind CSS v4** lendo as variáveis CSS do Nocturne (`tokens/`) | Tokens únicos, sem duplicar valores |
| Componentes | Próprios (pasta `components/ui`), com **Radix UI** só para Dialog, DropdownMenu, Tooltip, Switch | Acessibilidade pronta sem impor visual |
| Ícones | `@phosphor-icons/react` | Mesmo set do design |
| Banco | **PostgreSQL 16** via **Drizzle ORM** (`pg`) | Tipado, migrações em SQL, sem binários (DECISOES §17) |
| Tempo real | **Socket.IO** no mesmo processo Node (servidor customizado `server.ts`) | Mensagens, status, presença e "digitando" instantâneos |
| Arquivos | Disco local do VPS (volume Docker), servidos por rota autenticada | Simples, sem custo extra; dá para trocar por S3 depois |
| Mídia | `sharp` (imagens), `ffprobe`/`ffmpeg` (duração e capa de vídeo) | Remove EXIF/GPS, gera miniaturas |
| Hash | **argon2id** (`@node-rs/argon2`) para senha e PIN | Padrão atual |
| Validação | **zod** em toda entrada | Mesmo schema no cliente e no servidor |
| Dados no cliente | **TanStack Query** + store pequeno (Zustand) para sessão/bloqueio | Cache fácil de **apagar ao bloquear** |
| E-mail | SMTP do e-mail da Hostinger (`nodemailer`) | Só para recuperação de senha do admin |
| Testes | Vitest (unidade) + Playwright (fluxos) | Ver §11 |

## 2. Estrutura de pastas

```
nuvemleads/
├── CLAUDE.md
├── server.ts                    # Next + Socket.IO no mesmo http.Server
├── drizzle/                     # migrações SQL geradas (versionadas)
├── scripts/migrate.ts  seed.ts
├── src/
│   ├── app/
│   │   ├── (participante)/
│   │   │   ├── page.tsx               # 4.1 Acesso
│   │   │   ├── u/[slug]/page.tsx      # 4.2 PIN
│   │   │   └── chat/page.tsx          # 4.3 Conversa + 4.4 Bloqueio
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   ├── esqueci-senha/page.tsx
│   │   │   ├── (painel)/layout.tsx    # sidebar / pílulas
│   │   │   ├── (painel)/page.tsx      # Painel
│   │   │   ├── (painel)/usuarios/page.tsx
│   │   │   ├── (painel)/usuarios/novo/page.tsx
│   │   │   ├── (painel)/usuarios/[id]/page.tsx
│   │   │   └── (painel)/configuracoes/page.tsx
│   │   ├── api/…                      # rotas da §5
│   │   ├── layout.tsx                 # fonte Inter, tokens, metadados neutros
│   │   └── globals.css                # importa tokens/*.css + Tailwind
│   ├── components/
│   │   ├── ui/        # Button, IconButton, Input, PinInput, Avatar, Badge, Toast, Modal, Dropdown, Tooltip, Switch, Segmented
│   │   ├── brand/     # Logo, LogoMark
│   │   ├── chat/      # ChatHeader, MessageList, MessageGroup, MessageBubble, DateDivider, AttachmentImage, AttachmentVideo, AudioPlayer, FileAttachment, UploadProgress, TypingIndicator, Composer, AttachMenu, EmojiPicker, Recorder, DraftPreviewModal, MediaViewer, OfflineBanner
│   │   ├── lock/      # LockScreen, LockController (eventos), useAutoLock
│   │   ├── states/    # EmptyState, LoadingState, ErrorState
│   │   └── admin/     # AdminShell, StatCard, ActivityList, UserRow, UserForm, SettingsForm
│   ├── db/            # schema.ts, index.ts (Drizzle)
│   ├── lib/
│   │   ├── auth/  rate-limit.ts  storage.ts  media.ts  socket.ts  validators.ts  mailer.ts  time.ts
│   └── styles/tokens/  # nocturne.css, nuvemleads.css (deste pacote)
├── tests/
├── Dockerfile
├── docker-compose.yml
└── Caddyfile
```

## 3. Modelo de dados

> Escrito em notação Prisma por ser fácil de ler; a implementação é em Drizzle, em `src/db/schema.ts` (DECISOES §17).

```prisma

enum UserStatus { ACTIVE INACTIVE }
enum AvatarTone { ACCENT NEUTRAL }
enum MessageKind { TEXT IMAGE VIDEO AUDIO FILE }
enum AttachmentStatus { PENDING READY FAILED }
enum LockReason { TAB BLUR IDLE MANUAL REOPEN }

model Conversation {                        // DECISOES §3: histórico pertence ao par
  id        String    @id @default(cuid())
  userAId   String                         // menor id do par
  userBId   String                         // maior id do par
  createdAt DateTime  @default(now())
  messages  Message[]
  @@unique([userAId, userBId])
}

model Admin {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  passwordChangedAt DateTime @default(now())
  createdAt    DateTime @default(now())
  sessions     AdminSession[]
  resetTokens  PasswordReset[]
}

model AdminSession {
  id        String   @id @default(cuid())
  tokenHash String   @unique          // sha256 do token do cookie
  adminId   String
  admin     Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  ip        String?
  userAgent String?
}

model PasswordReset {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  adminId   String
  admin     Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?
}

model User {
  id           String     @id @default(cuid())
  slug         String     @unique        // link pessoal /u/<slug>, 10+ chars aleatórios
  name         String
  tone         AvatarTone @default(NEUTRAL)
  avatarKey    String?
  pinHash      String
  pinVersion   Int        @default(1)    // incrementa ao trocar o PIN → derruba sessões
  pinChangedByAdminAt DateTime?          // DECISOES §9: aviso único na tela de PIN
  pinNoticeSeen Boolean   @default(true)
  status       UserStatus @default(ACTIVE)
  lastActiveAt DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  sessions     UserSession[]
  messages     Message[]  @relation("sender")
  attachments  Attachment[]
}

model UserSession {
  id          String      @id @default(cuid())
  tokenHash   String      @unique
  userId      String
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  pinVersion  Int
  locked      Boolean     @default(false)
  lockReason  LockReason?
  lockedAt    DateTime?
  fresh       Boolean     @default(false)   // DECISOES §7: só o 1º carregamento após o PIN entra desbloqueado
  lastSeenAt  DateTime    @default(now())   // heartbeat com atividade real
  expiresAt   DateTime                      // teto absoluto: 12 h
  createdAt   DateTime    @default(now())
}

model Message {
  id           String      @id @default(cuid())
  conversationId String
  conversation Conversation @relation(fields: [conversationId], references: [id])
  clientId     String                        // uuid gerado no cliente (idempotência)
  senderId     String
  sender       User        @relation("sender", fields: [senderId], references: [id])
  kind         MessageKind
  body         String?     @db.VarChar(4000) // texto ou legenda
  attachmentId String?     @unique
  attachment   Attachment? @relation(fields: [attachmentId], references: [id])
  createdAt    DateTime    @default(now())
  deliveredAt  DateTime?
  readAt       DateTime?
  @@unique([senderId, clientId])
  @@index([conversationId, createdAt])
}

model Attachment {
  id           String           @id @default(cuid())
  uploaderId   String
  uploader     User             @relation(fields: [uploaderId], references: [id])
  kind         MessageKind
  storageKey   String           // caminho relativo no volume
  thumbKey     String?          // miniatura de imagem / capa de vídeo
  mime         String
  sizeBytes    Int
  originalName String
  width        Int?
  height       Int?
  durationSec  Int?
  status       AttachmentStatus @default(PENDING)
  createdAt    DateTime         @default(now())
  message      Message?
}

model Settings {
  id              Int     @id @default(1)
  autoLockMinutes Int     @default(5)      // 1 | 5 | 15 | 30
  lockOnTabLeave  Boolean @default(true)
  lockOnReopen    Boolean @default(true)
}

model RateLimit {
  key          String   @id                // ex.: "pin:<userId>:<ip>", "admin:<email>"
  count        Int      @default(0)
  windowStart  DateTime @default(now())
  blockedUntil DateTime?
}

model AdminEvent {                          // trilha de ações do admin (sem conteúdo de mensagens)
  id        String   @id @default(cuid())
  adminId   String
  action    String   // USER_CREATED, USER_UPDATED, PIN_CHANGED, USER_DEACTIVATED, SETTINGS_UPDATED…
  targetId  String?
  createdAt DateTime @default(now())
}
```

Regras de negócio no banco/serviço:
- **Máximo de 2 usuários `ACTIVE`** — validar em transação (`SELECT … FOR UPDATE` ou contagem dentro de `db.transaction` com isolamento serializable).
- Desativar usuário ou trocar PIN → `DELETE UserSession WHERE userId` + evento socket `session:revoked`.
- O "outro participante" de uma sessão é sempre o outro usuário ativo; a conversa é a do par ativo (DECISOES §3).
- "Atividade recente" do painel = últimas 5 mensagens (só `senderId`, `kind`, `createdAt`). **O admin nunca recebe `body` nem mídia.**
- Contadores do painel: `count(User where ACTIVE)`, `count(Message)`, `count(Attachment where READY)`, `max(Message.createdAt)`.

## 4. Tokens no código

- Copie `tokens/nocturne.css` e `tokens/nuvemleads.css` para `src/styles/tokens/` e importe em `globals.css` **antes** do Tailwind.
- `nuvemleads.css` já traz o bloco `@theme` do Tailwind v4 que expõe as variáveis (`bg-surface`, `text-muted`, `border-divider`, `bg-sent`, `text-success`, `rounded-bubble`, `shadow-md`…).
- Use as classes do Nocturne (`.btn`, `.btn-primary`, `.input`, `.card`, `.tag`, `.seg`, `.dialog`) dentro dos componentes React de `components/ui` — ou reescreva-as como variantes Tailwind com exatamente os mesmos valores. Não invente cores.
- Fonte: `next/font/local` com Inter (400, 500, 600) em `src/app/fonts/`, `display: swap`, variável `--font-body` (DECISOES §18).

## 5. API (Route Handlers)

Todas as respostas JSON têm `Cache-Control: no-store`. Toda entrada passa por zod. Mutações exigem cabeçalho `Origin` igual ao domínio.

### Participante
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/public/u/:slug` | `{ firstName, initials, tone, avatarUrl? }` para a tela de PIN. 404 se inativo. |
| POST | `/api/auth/pin` | `{ slug, pin }` → cria `UserSession`, define cookie `__Host-nl_user`. Erros: `401 INVALID_PIN { attemptsLeft }`, `429 TOO_MANY { retryAfter }` |
| POST | `/api/session/lock` | `{ reason }` → `locked = true`. Aceita `navigator.sendBeacon`. |
| POST | `/api/session/unlock` | `{ pin }` → `locked = false`. Mesmo rate limit do login. |
| POST | `/api/session/heartbeat` | `{ active: boolean }` a cada 30 s; se `now - lastSeenAt > autoLock` → servidor bloqueia e responde `423`. |
| POST | `/api/auth/logout` | Apaga a sessão e o cookie. |
| GET | `/api/me` | Sessão, contato (nome, presença, visto por último) e `settings`. |
| GET | `/api/messages?cursor=&limit=50` | Paginação reversa. **423 se a sessão estiver bloqueada.** Marca como entregues as mensagens da outra pessoa (DECISOES §11). |
| POST | `/api/messages` | `{ clientId, kind:'TEXT', body }` ou `{ clientId, kind, attachmentId, caption? }`. Idempotente por `clientId`. |
| POST | `/api/messages/read` | `{ upToId }` — só aceita se a sessão está desbloqueada e a aba visível. |
| POST | `/api/uploads` | `multipart/form-data` (campo `file`, máx. 25 MB; vídeo 100 MB; streaming com busboy — DECISOES §12) → `{ attachmentId, kind, width?, height?, durationSec?, thumbUrl? }`. Use **XMLHttpRequest** no cliente para ter `upload.onprogress`. |
| GET | `/api/media/:id` | Stream do arquivo com suporte a `Range` (vídeo/áudio). Autorização: sessão desbloqueada de um dos 2 participantes. |
| GET | `/api/media/:id/thumb` | Miniatura/capa. |
| GET | `/api/media/:id/download` | `Content-Disposition: attachment; filename*=UTF-8''…` |

### Admin (cookie `__Host-nl_admin`, 8 h, renovação deslizante)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/admin/login` | `{ email, password }`. Erro genérico `401` ("Não foi possível entrar. Verifique seus dados."). |
| POST | `/api/admin/logout` | |
| POST | `/api/admin/password/forgot` | Sempre `200`; envia e-mail com link de 30 min se o e-mail existir. |
| POST | `/api/admin/password/reset` | `{ token, password }` |
| GET | `/api/admin/dashboard` | contadores + atividade recente |
| GET / POST | `/api/admin/users` | listar / criar `{ name, pin, status, avatar? }` (multipart se houver foto) |
| PATCH | `/api/admin/users/:id` | `{ name?, status?, avatar? }` |
| POST | `/api/admin/users/:id/pin` | `{ pin }` → `pinVersion++`, derruba sessões |
| POST | `/api/admin/users/:id/link` | Gera novo `slug` (invalida o link antigo) |
| POST | `/api/admin/users/:id/pin-attempts/reset` | "Liberar tentativas" (DECISOES §8) |
| GET / PATCH | `/api/admin/settings` | `{ autoLockMinutes, lockOnTabLeave, lockOnReopen }` → emite `settings:updated` |
| PATCH | `/api/admin/account` | `{ name, email }` |
| POST | `/api/admin/account/password` | `{ current, next }` (mín. 10 caracteres) → derruba outras sessões admin |

Formato de erro padrão: `{ error: { code: 'VALIDATION'|'INVALID_PIN'|'TOO_MANY'|'LOCKED'|'REVOKED'|'ROOM_FULL'|'NOT_FOUND'|'FORBIDDEN', message, fields? } }`. As mensagens em português são as do `README.md`.

## 6. Acesso do participante (links pessoais)

- Cada usuário recebe um link `https://dominio/u/<slug>` (slug com ≥ 10 caracteres aleatórios, `nanoid`). O admin copia e envia à pessoa. A tela de escolha `/` pode listar só iniciais ou ser desativada em produção (`PUBLIC_PICKER=false`), para não expor nomes.
- O link sozinho não dá acesso: sempre exige o PIN.
- Cookie de participante: `__Host-nl_user` em produção (`nl_user` em dev), `HttpOnly; Secure; SameSite=Strict; Path=/`, `Max-Age` de 12 h. O comportamento de "reabrir" é o de DECISOES §7. Cookie `nl_last` com o slug: DECISOES §13.

## 7. Segurança

**PIN e senha**
- argon2id (memoryCost 19 MiB, timeCost 2). Nunca logar PIN/senha. PIN nunca volta em nenhuma resposta.
- Rate limit do PIN: ver DECISOES §8 (sem bloqueio permanente do usuário).
- Admin: 5 erros por e-mail+IP em 15 min → 15 min de bloqueio.
- PIN fraco rejeitado no servidor (mesmas regras do formulário).

**Bloqueio (camada principal do produto)**
- Cliente (`LockController`): escuta `visibilitychange`, `blur`/`focus` (com tolerância de 1,5 s), inatividade e o botão. Ao bloquear: (1) muda o store para `locked` — o `<MessageList>` é desmontado; (2) `queryClient.clear()`; (3) revoga `URL.createObjectURL` pendentes e pausa mídia; (4) `sendBeacon('/api/session/lock')`; (5) `BroadcastChannel` avisa as outras abas; (6) desconecta o socket da sala. Antes de tudo, o véu síncrono (DECISOES §5); exceção do seletor de arquivo: DECISOES §4.
- Servidor: com `locked = true`, as rotas de mensagens e mídia retornam `423` e o handshake do socket é recusado (DECISOES §10). O heartbeat aplica o bloqueio por inatividade mesmo que o cliente seja adulterado.
- Ao desbloquear: recarrega as mensagens do servidor (nada fica guardado no cliente).
- Não usar `localStorage`/`IndexedDB` para mensagens. Service worker, se houver, **não** pode cachear `/api/*` nem `/api/media/*`.
- `document.title` sempre "NuvemLeads" (sem nome do contato nem prévia de mensagem). Sem notificações push no MVP.

**HTTP**
- Cabeçalhos: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, CSP com nonce em `proxy.ts` conforme DECISOES §14, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`.
- CSRF: `SameSite=Strict` + checagem de `Origin` em POST/PATCH/DELETE.
- Mídia sempre via rota autenticada; nunca expor a pasta de uploads diretamente.

**Uploads**
- Limites 25 MB / vídeo 100 MB, por streaming no servidor; Caddy `request_body max_size 101MB` (DECISOES §12).
- Detectar o tipo real pelos bytes (`file-type`), não pela extensão.
- Imagens JPG/PNG/WEBP: `sharp` → remove EXIF/GPS, limita a 2560 px, gera miniatura 600 px (webp).
- Vídeo (mp4/webm/mov): `ffprobe` para duração/dimensões/codec, `ffmpeg` extrai a capa no segundo 1. Codec fora de H.264/VP8/VP9 → converter para MP4 H.264 (DECISOES §12).
- Áudio (webm/ogg/mp4/mpeg): `ffprobe` para duração.
- Arquivos: bloquear executáveis e scripts (`exe, msi, bat, cmd, sh, ps1, js, html, htm, svg, apk, dmg`); sempre servir com `Content-Disposition: attachment`.
- Nomes no disco: `uploads/AAAA/MM/<cuid>.<ext>`; nome original só no banco.

**Admin**
- Admin não tem nenhuma rota que retorne conteúdo de mensagens ou mídia.
- Um único admin no MVP (criado pelo seed / variável de ambiente).

## 8. Tempo real (Socket.IO)

- Handshake autentica pelo cookie de participante; rejeita sessões bloqueadas/expiradas.
- Uma sala por conversa: `conv:<conversationId>`.

| Evento | Direção | Payload |
|---|---|---|
| `message:new` | S→C | mensagem completa (DTO) |
| `message:ack` | S→C (remetente) | `{ clientId, id, createdAt }` → status "enviada" |
| `message:delivered` | C→S | `{ id }` → servidor marca `deliveredAt` e emite `message:status` |
| `message:status` | S→C | `{ id, status: 'delivered'|'read' }` |
| `typing` | C→S / S→C | `{ on: boolean }` (debounce 3 s) |
| `presence` | S→C | `{ userId, online, lastSeenAt }` (online = socket conectado e sessão desbloqueada) |
| `session:revoked` | S→C | volta à tela de PIN (PIN alterado/usuário desativado) |
| `session:locked` | S→C | servidor bloqueou (inatividade) |
| `session:locking` | C→S | cliente vai bloquear e desconectar (DECISOES §10) |
| `tab:takeover` | S→C | outra aba da mesma pessoa assumiu (DECISOES §6) |
| `settings:updated` | S→C | novos tempos de bloqueio |

- Reconexão automática com backoff; durante a reconexão mostra a faixa offline. Fila local de textos "enviando" reenviada com o mesmo `clientId` (idempotente).

## 9. Fluxo de envio de anexo (estados do design)

1. **Selecionando arquivo** — menu de anexo / seletor nativo / câmera / gravação.
2. **Preview** — modal com legenda (imagem/vídeo). Validação local de tipo e tamanho.
3. **Preparando** — cria a mensagem otimista (`upload.state = 'preparing'`), gera capa local de vídeo (canvas) para exibir enquanto envia.
4. **Enviando / em andamento** — `XMLHttpRequest` → `upload.onprogress` atualiza a barra.
5. **Concluído** — recebe `attachmentId`, faz `POST /api/messages`; mostra "Concluído" por 900 ms.
6. **Erro** — status "falhou" + "Tentar novamente" (reenvia o mesmo arquivo, que fica em memória até sair da tela ou bloquear).

## 10. Variáveis de ambiente (`.env.example`)

```
NODE_ENV=production
APP_URL=https://chat.seudominio.com.br
POSTGRES_PASSWORD=gerar-com-openssl-rand-hex-32
DATABASE_URL=postgresql://nuvem:MESMA_SENHA@db:5432/nuvemleads
SESSION_SECRET=gerar-com-openssl-rand-base64-48
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_MB=25
MAX_VIDEO_MB=100
PUBLIC_PICKER=false
ADMIN_SEED_NAME=Renata Alves
ADMIN_SEED_EMAIL=admin@seudominio.com.br
ADMIN_SEED_PASSWORD=trocar-no-primeiro-acesso
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=nao-responda@seudominio.com.br
SMTP_PASS=
SMTP_FROM="NuvemLeads <nao-responda@seudominio.com.br>"
```

## 11. Testes mínimos

- **Unidade (Vitest):** validação de PIN, regra de 2 ativos, rate limit, detecção de tipo de arquivo, formatação de horário/data ("Hoje", "Ontem", "12 de março").
- **E2E (Playwright), um por fluxo abaixo:**
  - Admin: login (erro e sucesso) → painel → usuários → criar (validações) → criado → lista → editar → trocar PIN (confirmação) → configurações.
  - Participante: link → PIN errado (tremor + mensagem) → 3 erros (espera) → PIN certo → conversa → enviar texto → anexar imagem → preview → enviar (progresso) → receber mensagem (segundo contexto do navegador) → abrir imagem (zoom/baixar) → bloquear → tela bloqueada → PIN → conversa.
  - Bloqueio por troca de aba (`page.evaluate` disparando `visibilitychange`) e por inatividade (relógio falso).
  - Sessão bloqueada não consegue `GET /api/messages` (423).
- Acessibilidade: `@axe-core/playwright` sem violações sérias nas telas principais.
