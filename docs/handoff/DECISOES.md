# NuvemLeads — Decisões e correções (revisão de 11/10/2026)

> **Este arquivo prevalece** sobre README.md, ARQUITETURA.md, HOSPEDAGEM_HOSTINGER.md e PROMPTS_CLAUDE_CODE.md quando houver conflito.
> Os trechos afetados nesses arquivos já foram ajustados e apontam para cá com "ver DECISOES §N".

## 1. Versões fixadas

Nunca instalar com `@latest`. Versões exatas no `package.json` (sem `^`):

| Pacote | Versão | Observação |
|---|---|---|
| next | 16.4.0 | Next 15 está só em manutenção. No 16: `middleware.ts` virou `proxy.ts` (roda em Node, pode acessar o banco); `params`/`cookies()` são assíncronos; Turbopack é o padrão. |
| react / react-dom | 19.3.0 | |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | Substitui o Prisma (§17). |
| pg | 8.23.1 | Driver do Postgres. |
| typescript | 5.9.3 | O TypeScript 7 ainda não é suportado por todas as ferramentas. |
| eslint / eslint-config-next | 9.39.5 / 16.4.0 | |
| vitest / @playwright/test | 5.0.3 / 1.64.0 | |
| @axe-core/playwright / axe-core | 4.13.0 / 4.13.0 | Verificação automática de acessibilidade (Etapa 9). |
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

## 20. Detalhes do banco (Etapa 2)

- Ids são `uuid` gerados pelo Postgres (no lugar de `cuid`).
- Regra dos 2 ativos: toda criação/ativação passa por uma trava de transação (`pg_advisory_xact_lock`) antes de contar os ativos; testado com ativações e criações simultâneas.
- Restrições no próprio banco: par da conversa em ordem e sem repetir a pessoa, mensagem de texto exige corpo e mídia exige anexo, `settings` com linha única e tempo de bloqueio só 1/5/15/30.
- Link pessoal: 12 caracteres de um alfabeto sem `0 o 1 i l` (≈ 59 bits).
- Seed: recusa rodar em produção com a senha de exemplo do admin e recusa `SEED_DEMO=true` em produção. A demonstração usa os PINs do protótipo (123456 e 246810), gravados direto pelo seed — o formulário recusaria 123456 por ser previsível. Gera PDF, áudio e vídeo reais de exemplo quando há `ffmpeg`.

## 21. Login do administrador (Etapa 3)

- Bloqueio por tentativas mostra "Muitas tentativas. Tente novamente em alguns minutos." (o README só define a mensagem genérica de erro).
- "Esqueci minha senha": confirmação genérica "Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. O link vale por 30 minutos."; até 5 pedidos por IP em 15 min; pedir de novo invalida o link anterior; trocar a senha encerra todas as sessões de admin.
- Em desenvolvimento e nos testes, sem `SMTP_PASS`, os e-mails vão para `MAIL_OUTBOX` (JSON). Em produção, sem SMTP, o envio falha no log e a tela continua com a resposta genérica.
- Os testes no navegador usam um banco próprio (`nuvemleads_e2e`), recriado a cada execução.
- O `proxy.ts` só redireciona quem não tem cookie e renova o prazo dele; o layout do painel valida a sessão no banco.

## 22. Painel do administrador (Etapa 4)

- Contadores e "Atividade recente" contam só a conversa do par ativo (§3). Sem par ativo, ficam zerados; a atividade mostra "Nenhuma atividade ainda."
- Foto de perfil: JPG/PNG/WEBP até 5 MB, conferida pelos bytes, recortada em 256×256 WEBP sem EXIF/GPS. Servida em `/api/avatars/<uuid>` — o id aleatório muda a cada troca e é a própria permissão (a foto também aparece na tela de PIN de quem tem o link).
- Tom do avatar de quem é criado: o oposto do da outra pessoa ativa (accent/neutral), para as duas se distinguirem.
- Link pessoal no formulário de edição, com "Copiar link" e "Gerar novo link" (confirmação: "O link atual deixa de funcionar imediatamente."); toast "Link copiado.".
- Textos que o README não definia: "Ainda não acessou" (lista), "Tentativas liberadas.", "Novo link gerado. O anterior deixou de funcionar.", "A senha atual não confere.", "Este e-mail já está em uso.".
- Mudança de status é aplicada antes do resto do formulário: com a sala cheia, nada é salvo pela metade.
- As rotas avisam o barramento interno (`session:revoked`, `settings:updated`); a Etapa 6 liga isso ao Socket.IO.

## 23. Acesso do participante e PIN (Etapa 5)

- Espera por tentativas: até 60 s a mensagem é a do README com a contagem ("Muitas tentativas. Aguarde alguns segundos. (15s)"); acima disso, "Muitas tentativas. Tente novamente em N min.".
- PIN certo zera o contador daquele IP e tira a espera por pessoa; a contagem de 24 h por pessoa continua, para o aviso do painel do admin não sumir.
- Link inválido ou pessoa inativa: "Link inválido" / "Este link não é válido. Peça um novo link ao administrador.". Com `PUBLIC_PICKER=false` e sem link lembrado, a tela inicial mostra "Conversa privada" / "Abra o link pessoal que o administrador enviou para você.".
- "Não é você? Trocar" esquece o link lembrado (`nl_last`) e volta ao início. "Encerrar sessão" apaga a sessão, mas mantém o link lembrado.
- **Regra de reabrir (§7), refinada:** quem decide é o navegador, não a renderização da página. A conversa chama `POST /api/session/boot` uma única vez por carregamento completo da página; o primeiro depois do PIN entra, os seguintes começam bloqueados (`REOPEN`). Motivo: decidir na renderização do servidor bloqueava na hora, porque o Next renderiza a mesma página mais de uma vez (navegação + atualização interna). Isso é uma proteção de uso, não de segurança: as rotas de conteúdo continuam exigindo sessão desbloqueada (423).
- Até a tela de bloqueio existir (Etapa 8), sessão bloqueada em `/chat` volta para a tela de PIN.
- IP para os limites: primeiro valor de `X-Forwarded-For`. O Caddy substitui esse cabeçalho pelo IP real do cliente (não confia no que vem de fora), então não dá para burlar o limite por IP trocando o cabeçalho; o limite por pessoa vale de qualquer forma.
- Foco no PIN: a caixa ativa mostra borda accent + anel; o campo invisível não ganha contorno próprio.
- Testes no navegador em fases: fluxo do admin → preparação de Maria e Allan → demais testes no desktop e no celular.

## 24. Conversa em tempo real (Etapa 6)

- **Horários com precisão de milissegundos** em todo o banco (migração `0001`). Com microssegundos, comparações feitas com datas vindas do JavaScript (cursor da paginação, "lida até") perdiam mensagens criadas no mesmo milissegundo.
- Enviar texto é por `POST /api/messages` (a resposta é o "ack"); o servidor avisa a outra pessoa por `message:new`. O mesmo `clientId` nunca duplica.
- Fila de envio: erro de rede deixa a mensagem "enviando" e ela sai sozinha quando a conexão volta; recusa do servidor deixa "falhou" + "Tentar novamente". A fila fica só na memória e é apagada ao bloquear ou sair.
- "Lida": com a aba visível, o aparelho marca até a última mensagem da outra pessoa. "Entregue": quando chega pelo socket ou quando a lista é carregada.
- "Digitando": aviso a cada 3 s enquanto digita; para depois de 3 s parado, ao enviar ou ao sair do campo; some sozinho em 6 s se o aviso de parar se perder.
- Presença: online = ao menos uma conexão aberta e desbloqueada. Ao sair, grava "visto por último" (`users.last_active_at`). Textos: "Visto por último hoje/ontem às 09:40", "Visto por último em 12 de março às 18:20", "Offline" se nunca entrou.
- Sem par ativo: "A conversa ainda não está disponível" / "Ela abre quando o administrador ativar a outra pessoa." (texto novo).
- Quando o par ativo muda, o servidor avisa `room:changed`, desconecta todos e os aparelhos reconectam e recarregam a conversa.
- O botão "Bloquear" e "Bloquear agora" já bloqueiam no servidor (`POST /api/session/lock`, rotas passam a responder 423). Até a Etapa 8, a pessoa volta para a tela de PIN.
- Clipe de anexo e microfone aparecem desativados até a Etapa 7. Mensagens com anexo mostram o nome do arquivo até lá.
- A conexão com o banco é aberta no primeiro uso (não ao carregar o módulo), para não depender da ordem de leitura do `.env` no código compilado.

## 25. Anexos (Etapa 7)

- Upload por streaming direto ao disco (busboy), cortado em 100 MB; depois de saber o tipo real, o que não é vídeo acima de 25 MB é recusado.
- Tipo real pelos bytes (`file-type`) + `ffprobe`. "Foto ou vídeo" aceita só JPG/PNG/WEBP ou vídeo; "Arquivo" aceita o resto, menos executáveis e scripts (pelo conteúdo e pelo nome). Texto novo: "Este tipo de arquivo não é permitido.".
- Fotos: rotação corrigida, sem EXIF/GPS, no máximo 2560 px; miniatura WEBP de 600 px usada na bolha (a original abre no visualizador).
- Vídeo: capa WEBP no segundo 1; HEVC e outros codecs fora de H.264/VP8/VP9/AV1 são convertidos para MP4 H.264 numa fila de um por vez; a mensagem pode ser enviada enquanto converte ("Processando vídeo…") e a conversa é avisada quando termina (`message:updated`).
- Áudio gravado no navegador é remontado sem recodificar ao chegar: o gravador do Chrome não grava a duração no arquivo, e o player mostrava 0:00.
- Mídia sempre por rota autenticada, com `Cache-Control: private, no-store` (nada fica no cache do aparelho), `nosniff` e `sandbox`. Arquivos comuns sempre como download.
- Gravação de áudio: envia direto ao tocar em enviar (sem prévia); máximo de 10 min; "Não foi possível acessar o microfone." se a permissão for negada.
- Prévias locais (`blob:`) ficam registradas e são todas revogadas ao bloquear/sair; envios em andamento são cancelados.
- O seletor de arquivo avisa o bloqueio (`picker-guard`) para a Etapa 8 suspender o bloqueio com véu enquanto a pessoa escolhe (§4).
- Nos testes no navegador, o vídeo é WEBM: o Chromium de testes não toca H.264 (o Chrome e o Safari normais tocam).

## 26. Camada de bloqueio (Etapa 8)

- O bloqueio é decidido no aparelho e confirmado no servidor: o aparelho liga o véu, apaga a conversa da memória, avisa o servidor (`sendBeacon`) e as outras abas (`BroadcastChannel`). A partir daí as rotas de conteúdo respondem 423.
- Véu imediato: ao perder a aba ou o foco, a página inteira fica escondida (`html[data-veil="on"]`) antes de qualquer outra coisa, para a conversa não aparecer na troca de apps nem na prévia do sistema.
- Perda de foco da janela: 1,5 s de tolerância; se o foco voltar, só o véu sai.
- Seletor de arquivo, câmera e permissão do microfone suspendem o bloqueio (no máximo 3 min); o véu continua.
- Inatividade: o aparelho conta o tempo de Settings; o servidor também confere (sinal a cada 30 s e varredura a cada 30 s com 30 s de folga), então uma aba congelada pelo sistema também fica bloqueada.
- Ao fechar ou recarregar a página com "Exigir PIN ao reabrir" ligado, a sessão é bloqueada com o motivo "A página foi aberta novamente." Com a opção desligada, a página volta desbloqueada.
- Uma aba por pessoa (§6): a aba que abre a conversa avisa as outras, que apagam a conversa e mostram "A conversa está aberta em outra aba." com "Usar esta aba".
- Trocar o PIN, desativar a pessoa ou a sessão vencer: o desbloqueio responde "sessão revogada" e a pessoa volta para a tela de PIN do link.
- Motivos na tela de bloqueio: aba, foco da janela, inatividade (com os minutos), reabertura e manual.

## 27. Acabamento (Etapa 9)

- Teclado do celular: além de `interactive-widget=resizes-content` (Chrome do Android), a conversa usa a altura da área visível (`--nl-vvh`, via `visualViewport`) porque o Safari do iPhone ignora essa opção. Se a lista estava no fim, continua no fim quando o teclado abre ou o aparelho gira.
- Acessibilidade verificada com axe (`@axe-core/playwright` 4.13.0, regras WCAG 2.1 A/AA) em início, login, esqueci a senha, PIN, PIN incorreto, painel, usuários, confirmação, editar, novo usuário, configurações, alterar senha, conversa, menus e bloqueio, no desktop e no celular. Nenhuma violação séria ou crítica.
- Correções: o texto auxiliar dos cartões do Nocturne (50% do texto) passa a usar `--color-neutral-400` para alcançar contraste 4,5:1; os menus suspensos deixaram de ser modais (o resto da página não fica "escondido" para o leitor de tela enquanto continua focável), mas o foco entra no menu, Esc e Tab fecham; avatar sem nome é lido como "Avatar".
- Ícones: `icon.svg` (o símbolo do pacote), `apple-icon.png` 180 px com fundo até a borda (o iPhone arredonda), `icon-192.png` e `icon-512.png`; gerados por `node scripts/gen-icons.mjs`. Manifest mínimo (nome, cores, ícones), sem service worker.
- O selo do modo de desenvolvimento do Next foi desligado: cobria o botão de anexo no celular.
- Tablet (834 px): conversa em largura total e painel sem rolagem lateral, conferidos em teste.

## 28. Segurança final e produção (Etapa 10)

- **CSP com nonce** em toda página (`src/lib/csp.ts` + `src/proxy.ts`): nonce novo a cada resposta, `strict-dynamic`, sem `unsafe-eval` em produção, `worker-src 'none'` (sem service worker), `connect-src 'self'` + `wss://` do `APP_URL`. Sem `upgrade-insecure-requests` (o HSTS do Caddy já força HTTPS). Para cada resposta levar o próprio nonce, o layout raiz é montado a cada visita (`connection()`); só ícones e manifest ficam estáticos.
- O `proxy.ts` agora roda em todas as páginas (antes só em `/admin` e `/chat`); rotas `/api` ficam de fora (JSON e mídia têm cabeçalhos próprios).
- Teste de segurança no navegador: todo `<script>` sai com o nonce, nenhuma violação de CSP no painel, PIN, conversa, foto (prévia `blob:`), visualizador e bloqueio; HTML injetado com `onerror` não roda.
- `E2E_PROD=1 npx playwright test` (depois de `npm run build`) roda a bateria inteira contra o build de produção (cookies `__Host-`, CSP sem eval). Pula só `/dev/ui` (não existe em produção) e o e-mail de redefinição (em produção sai por SMTP).
- `/api/health`: `{"ok":true}` com 200, ou 503 se o banco não responder em 2 s. Sem nenhum dado.
- Ajustes nos arquivos de deploy em relação a HOSPEDAGEM §3:
  - `Dockerfile`: copia `next.config.ts` (o servidor lê na partida); define `HOSTNAME=0.0.0.0` (o Docker preenche com o id do contêiner) e `UPLOAD_DIR=/data/uploads`; apaga `.next/cache` (113 MB a menos); `HEALTHCHECK` na rota de saúde.
  - `Caddyfile` usa `{$APP_DOMAIN}` do `.env` (nada para editar no arquivo); `docker-compose.yml` passa essa variável ao Caddy e já aponta para `ghcr.io/allanvieiramidias-lgtm/nuvemleads`.
  - Modelo do `.env` do servidor em `.env.production.example` (inclui `APP_DOMAIN`). `SESSION_SECRET` não é usado (as sessões são tokens aleatórios com hash no banco) e saiu do modelo.
  - Workflow `deploy.yml` em três passos: **check** (typecheck, lint, testes com Postgres) → **image** (monta, liga a imagem com um Postgres e confere saúde, CSP sem eval, seed, login do admin, ffmpeg, usuário sem privilégio e pasta de uploads gravável; só então publica no GHCR) → **deploy** (SSH). Sem os segredos `VPS_HOST`/`VPS_SSH_KEY`, para depois de publicar a imagem, sem erro. Máquinas fixas em Ubuntu 24.04 e actions em versões com Node 24.
- O Docker Hub é bloqueado no ambiente de desenvolvimento; a imagem é montada e conferida no GitHub Actions. Localmente, o conjunto de arquivos da imagem (só dependências de produção) foi ligado com migração, seed e servidor, e o login no painel funcionou.

## 29. Usuário + PIN, aparelho lembrado, aviso de novas mensagens e emojis (14/10/2026)

Pedido do responsável pelo produto, depois da publicação. Amplia o escopo do README de propósito, sem mudar a regra de que só o PIN abre a conversa.

- **Página principal com usuário + PIN.** `chat.<domínio>` mostra o campo "Usuário" ("Digite seu usuário para continuar.") e depois o PIN. O link pessoal continua funcionando. O usuário não é conferido antes do PIN: usuário inexistente ou inativo responde exatamente como PIN errado ("PIN incorreto. Tente novamente."), com o mesmo tempo e os mesmos limites (3 erros → 15 s; 5 → 15 min). Limite novo por IP: 20 erros em 15 min, em qualquer usuário, bloqueiam o IP por 15 min.
- **Usuário:** 3 a 24 caracteres `a-z 0-9 . _ -`, minúsculo, único. O admin define ao criar/editar (sugerido a partir do primeiro nome, sem acento). Sem usuário informado, o servidor gera um ("maria", "maria2"…), dentro da mesma trava da regra dos 2 ativos. A migração `0002` gerou usuários para quem já existia.
- **Aparelho lembrado (180 dias, renovados a cada PIN certo).** Cookie `__Host-nl_device` (HttpOnly, SameSite=Strict) com token opaco; só o hash vai para o banco (`trusted_devices`). Ele não dá acesso a nada: leva direto à tela de PIN da pessoa e libera o aviso. Deixa de valer ao trocar o PIN, desativar a pessoa, passar o prazo ou tocar em "Não é você? Trocar" (que esquece o aparelho). "Encerrar sessão" mantém o aparelho.
- **Aviso "Você tem novas mensagens".** `GET /api/notice` → `{ enabled, unread }`, só sim ou não (nunca quantas, de quem, quando nem o quê). Vale para a sessão do aparelho, mesmo bloqueada (tela de bloqueio), ou para o aparelho lembrado (tela de PIN). Quem chega só com o link não recebe nada (401). "Nova" = mensagem da outra pessoa ainda não lida. A tela confere ao abrir, a cada 30 s e quando a aba volta a ficar visível. Interruptor no painel: "Avisar novas mensagens na tela de PIN" (ligado por padrão). O título da aba continua sempre "NuvemLeads".
- **Catálogo completo de emojis:** 1.870 emojis (Unicode até 15.0, para aparecerem certo nos celulares dos últimos anos), em 9 categorias + "Mais usados" (os 24 de antes), com nomes em português (Emojibase 17.0.0, gerados por `node scripts/gen-emojis.mjs` em `src/components/chat/emoji-data.ts`). Sem tons de pele. O painel só é baixado quando abre pela primeira vez. Teclado: Tab entra na grade, setas andam, Esc fecha.
- Testes no navegador: a fase "notice" (`username.spec.ts`) roda sozinha, depois da conversa e antes dos demais, porque o aviso depende de mensagens não lidas.

## 30. Visualização única e painel de mídias (14/10/2026)

Pedido do responsável pelo produto. O admin continua sem acesso a conteúdo (regra mantida de propósito).

- **Visualização única, para texto e mídia.** Botão "Ver uma vez" no campo (vale para a próxima mensagem, inclusive áudio gravado) e interruptor na prévia do anexo. A lista de mensagens **nunca** devolve o conteúdo (nem para quem enviou). Quem recebeu toca em "Toque para ver uma vez": `POST /api/messages/:id/open` devolve o texto ou libera a mídia **uma única vez** (410 depois). Texto: apagado do banco na mesma hora. Mídia: liberada só para quem abriu, por até 10 min (vídeos longos), sem miniatura e sem download (só "Arquivo" tem o botão Baixar); ao fechar (`/close`) ou na varredura de 1 em 1 min, original e miniatura saem do disco. Bolhas: "Mensagem/Foto/Vídeo/Áudio/Arquivo · visualização única" e "· Aberta". Limite conhecido: ninguém impede uma foto da tela.
- **Apagar é de verdade:** `content_deleted_at` + `body`/`attachment_id` nulos + linha do anexo e arquivos removidos. A regra do banco (`messages_kind_payload`) aceita mensagem sem conteúdo só quando ele foi apagado.
- **Painel "Mídias" no admin:** espaço usado (total, por tipo, por mês nos últimos 12 meses) e livre no disco; nunca nomes, miniaturas ou conteúdo. **Limpeza automática** "Apagar mídias com mais de: Nunca / 30 dias / 90 dias / 6 meses / 1 ano" (padrão Nunca; roda a cada hora e ao ligar). **Limpeza manual** por data ("antes de", horário de Brasília) e tipos, com prévia ("Apagar N mídias? Libera X…") e confirmação. Na conversa, a mídia apagada vira "Mídia expirada" para os dois; textos não são apagados. Ações registradas na trilha do admin (MEDIA_RETENTION_UPDATED, MEDIA_PURGED).
- Arquivos são abertos antes de medidos ao enviar mídia: se forem apagados no meio, quem já abriu termina de receber e quem chega depois recebe 404 (antes, a conexão caía).
- Celular: as 4 pílulas do painel (com "Mídias") rolam dentro da barra, sem rolar a página.
