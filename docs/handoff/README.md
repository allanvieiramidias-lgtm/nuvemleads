# Handoff: NuvemLeads — mensageiro privado com bloqueio por PIN

> Pacote de documentação para gerar o sistema real com o **Claude Code** e publicá-lo na **Hostinger**.
> Leia nesta ordem: este README → `ARQUITETURA.md` → `HOSPEDAGEM_HOSTINGER.md` → `PROMPTS_CLAUDE_CODE.md`.
> **Leia também `DECISOES.md`, que prevalece sobre este arquivo em caso de conflito.**
> Copie `CLAUDE.md` para a raiz do repositório antes da primeira sessão do Claude Code.

---

## 1. Visão geral

O NuvemLeads é uma **sala privada de conversa entre exatamente duas pessoas**. Um administrador cria as duas pessoas e define o PIN de 6 dígitos de cada uma. Elas conversam por texto, imagem, vídeo, áudio e arquivos.

O diferencial é a **camada de proteção por PIN**: a conversa some da tela (e da memória do navegador) quando a pessoa troca de aba, a janela perde o foco, fica inativa por um tempo configurável ou clica em "Bloquear". Para voltar, digita o PIN.

Fora do escopo do MVP (não implementar): grupos, stories, status, chamadas, stickers, GIFs, reações, localização, contatos, busca, edição/encaminhamento de mensagens, analytics avançado, permissões complexas, cadastro público.

## 2. Sobre os arquivos de design

Os arquivos em `prototipo/` são **referências de design feitas em HTML**. Eles mostram a aparência e o comportamento esperados, mas **não são código de produção** para copiar. A tarefa é **recriar essas telas no stack definido em `ARQUITETURA.md`** (Next.js + TypeScript + Tailwind + PostgreSQL), com os padrões desse stack.

Para ver o protótipo: sirva a pasta `prototipo/` com qualquer servidor estático (`npx serve prototipo`) e abra `NuvemLeads.dc.html`. A barra superior navega entre as telas e o menu **Simular** força os estados (offline, falha de envio, troca de aba, inatividade).

Credenciais do protótipo (só para demonstração):
- PIN Allan `246810` · PIN Maria `123456`
- Admin `admin@nuvemleads.com` / `nuvem2026`

## 3. Fidelidade

**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos, raios, estados e microinterações são finais. Recrie pixel a pixel usando os tokens da seção 8. O design system de base é o **Nocturne** (tema escuro); a folha `prototipo/_ds/.../styles.css` é a fonte de verdade dos tokens.

---

## 4. Telas

Convenções: medidas em px; `--x` refere-se a tokens da seção 8; "regra que esmaece" = linha de 1px com gradiente `transparent → --color-divider (48px) → --color-divider (100%-48px) → transparent` (assinatura do Nocturne — nunca use bordas sólidas longas).

### 4.1 Acesso do participante — `/` (rota pública)
- **Propósito:** escolher quem está acessando (apenas usuários **Ativos**).
- **Layout:** coluna em tela cheia. Fundo `radial-gradient(110% 70% at 0% 0%, --color-accent-900, transparent 60%), --color-bg`. Topo: logo (símbolo 28px + wordmark 17/500) com padding 20px 24px. Centro: bloco de largura máx. 360px, gap 20px.
- **Conteúdo:** título H3 25/500 "Quem está acessando?"; subtítulo 14px `--color-neutral-500` "Esta é uma conversa privada entre duas pessoas."; lista de cards (gap 8px): botão com `--color-surface`, raio 14px, sombra `--shadow-sm`, padding 12px 14px, avatar 44px + nome 15/500 + ícone `caret-right`. Hover: `box-shadow: 0 0 0 1px --color-accent`. Rodapé: nota 12px com ícone `shield-check` "A conversa é ocultada sempre que você sair da janela." e botão ghost "Acesso administrativo" (12.5px, `--color-neutral-400`).
- **Produção (ver DECISOES §13):** em vez de listar nomes publicamente, recomenda-se **um link pessoal por usuário** (`/u/<slug>`) que abre direto a tela 4.2. A tela de escolha pode existir, mas só mostra iniciais/primeiro nome. Ver `ARQUITETURA.md §6`.

### 4.2 PIN do usuário — `/u/[slug]`
- **Layout:** mesmo fundo/topo da 4.1. Bloco central máx. 340px, gap 18px.
- **Conteúdo:** avatar 64px com anel `0 0 0 1px --color-accent` + brilho `0 0 28px accent 25%`; nome 16/500; botão ghost "Não é você? Trocar". Título H3 "Digite seu PIN"; texto 14px `--color-neutral-400` "Use os 6 dígitos definidos pelo administrador."
- **PIN Input (componente):** 6 caixas 46×54 (mobile 42×54), gap 8, fundo `--color-surface`, borda 1px, raio 8. Um `<input type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="6">` invisível cobre as caixas (captura teclado, colar e autofill do celular). Cada caixa preenchida mostra um ponto de 11px que entra com `transform: scale(0→1)` em 160ms `cubic-bezier(.3,1.6,.5,1)`.
  - Borda: vazio `--color-divider`; preenchido `--color-neutral-600`; ativo `--color-accent` + `box-shadow 0 0 0 3px accent 20%`; erro `--nl-error`; sucesso `--nl-success` + brilho.
- **Mensagem de estado** (linha de altura mínima 20px, 13px):
  - erro: "PIN incorreto. Tente novamente." (`--nl-error`) + tremor horizontal 420ms (−7, 6, −4, 2, 0 px) e limpeza do campo após 420ms;
  - 3 erros: "Muitas tentativas. Aguarde alguns segundos. (Ns)" (`--nl-warning`), campo desabilitado por 15s com contagem regressiva;
  - PIN trocado pelo admin (uma vez): "Seu PIN foi alterado pelo administrador." (`--nl-warning`) — DECISOES §9;
  - sucesso: "PIN correto. Abrindo conversa…" (`--nl-success`), botão vira "Desbloqueado" com ícone check; navega após 800ms.
- **Botão:** `.btn.btn-primary.btn-block` altura 42, ícone `lock-simple-open`, texto "Desbloquear". Desabilitado até 6 dígitos. Enter também envia.

### 4.3 Conversa — `/chat`
A tela mais importante. **A conversa é a protagonista.**

**Header** (padding 10px 20px; mobile 8px 10px; regra que esmaece embaixo):
- Desktop/tablet: logo (24px + wordmark 15/500) separado por borda direita 1px `--color-divider`, padding-right 16.
- Avatar do contato 38px com ponto de presença 11px (canto inferior direito, borda 2px `--color-bg`). Online: `--nl-success` com pulso (`box-shadow 0→6px`, 2.4s infinito). Offline: `--color-neutral-700`, sem pulso.
- Nome 15/500 (ellipsis); status 12px: "Online" (`--nl-success`) · "digitando…" (`--color-accent-300`) · "Visto por último hoje às 09:40" (`--color-neutral-500`).
- Só desktop: dica 12px `--color-neutral-500` com ícone `shield-check` "Bloqueio em 5 min sem atividade".
- Botão `.btn-secondary` "Bloquear" (ícone `lock-simple`; no mobile só ícone) e `.btn-icon.btn-secondary` com `dots-three-vertical` que abre o **menu de sessão**: "Bloquear agora", bloco informativo "Bloqueio automático — Após 5 min sem atividade ou ao sair da aba", "Encerrar sessão". Menu: `--color-surface`, `--shadow-md`, raio 14, padding 6, largura 250, entrada `translateY(10px)→0` + fade 160ms.

**Faixa offline** (quando `navigator.onLine === false` ou o socket cai): padding 8px, 12.5px, fundo `--nl-warning` a 10%, ícone `wifi-slash` "Sem conexão. As mensagens serão enviadas quando a conexão voltar."

**Área de mensagens** (scroll, padding 12px 24px; mobile 10px):
- Coluna centralizada **máx. 780px no desktop**; 100% no tablet/mobile.
- Selo inicial centralizado: ícone `lock-key` + "Conversa privada entre Allan e Maria" (11.5px, borda interna 1px `--color-divider`, raio 8).
- **Date Divider:** "Hoje" / "Ontem" / data por extenso, 11px caixa-alta `letter-spacing .08em` `--color-neutral-500`, com linhas que esmaecem dos dois lados; margem 18px 0 6px.
- **Message Group:** mensagens consecutivas do mesmo autor no mesmo dia. Gap 3px dentro do grupo, 14px entre grupos. A última bolha do grupo tem o "rabicho" (raio 4px no canto inferior do lado do autor).
- **Message Bubble:** largura máx. 70% (mobile 86%).
  - Recebida (esquerda): fundo `--color-surface`, texto `--color-text`, `box-shadow 0 0 0 1px text 6%`, raio `14 14 14 4`.
  - Enviada (direita): fundo `--color-accent-800`, texto `--color-accent-100`, raio `14 14 4 14`.
  - Texto: 14.5px / 1.45, `white-space: pre-wrap`, padding 7px 11px 5px.
  - Meta (alinhada à direita, 11px): horário + ícone de status (só nas enviadas): `clock` enviando · `check` enviada · `checks` entregue · `checks` bold `--color-accent-200` lida · `warning-circle` fill `--nl-error` falhou.
  - Falha: abaixo da bolha, 12px `--nl-error` "Não foi possível enviar." (ou "…o arquivo.") + botão ghost "Tentar novamente" (ícone `arrow-clockwise`).
  - Entrada: `opacity 0→1; translateY(6px)→0` 280ms ease-out.
- **Imagem:** largura 300 (mobile 232), proporção 4:3, `object-fit: cover`, raio 10, cursor zoom-in → abre o visualizador. Legenda opcional 14px abaixo.
- **Vídeo:** 300 × 16:10, thumbnail com `brightness(.62)`, botão play central 46px (círculo, borda 1px `--color-neutral-300`, fundo bg 55%), chip de duração no canto inferior esquerdo (ícone `video-camera` + "1:28", 11px).
- **Áudio (player customizado):** 240px. Botão play/pause circular 36px com borda accent; trilho 3px (`--color-neutral-800` nas recebidas, accent-100 22% nas enviadas) com preenchimento accent e bolinha 10px; tempos "0:12" / "0:42" 11px. Clique no trilho = seek.
- **Arquivo:** 264px. Ícone 40×40 raio 8 (`file-pdf`, `file-doc`, `file-xls`, `file-zip`, `file-text`, `file-csv`, ou `file`), nome 13.5/500 com ellipsis, "PDF · 2,4 MB" 11.5px, botão ícone `download-simple`.
- **Upload Progress** (dentro da bolha, abaixo do conteúdo): rótulo 11.5px + percentual à direita; barra 3px. Estados: "Preparando envio…" (spinner `circle-notch` girando 1s) → "Enviando arquivo… 82%" → "Concluído" (`--nl-success`, ícone check; some após 900ms) → ou erro (bolha com status falhou + "Tentar novamente").
- **Indicador "digitando":** bolha recebida com 3 pontos 6px que sobem 3px em sequência (1.2s, atrasos 0/.15/.3s).
- **Loading da conversa:** 5 bolhas "esqueleto" pulsando opacidade .45↔.9 e linha "Carregando conversa…" com spinner.
- Ao entrar, ao chegar mensagem nova ou ao carregar uma imagem: rolar até o fim (se o usuário já estiver a menos de 400px do fim).

**Composer** (padding 8px 24px 16px; mobile 8px 10px 12px; mesma coluna máx. 780):
- Botão anexo `paperclip` (40×42, `--color-neutral-400`).
- Campo pílula: altura mín. 42, raio 21, `--color-surface`, borda interna 1px `--color-divider`, placeholder "Digite uma mensagem...", fonte 14.5px, caret accent. Botão emoji `smiley` dentro do campo à direita.
- **Campo vazio → botão microfone** (42px, círculo, borda `--color-divider`, ícone `microphone`; hover borda/ícone accent).
- **Com texto → botão enviar** (42px, borda 1px accent, fundo accent 14%, ícone `paper-plane-right` fill `--color-accent-200`, brilho `0 0 18px accent 35%`, entra com `scale(.6)→1` 180ms; pressionado `scale(.92)`).
- Enter envia, Shift+Enter quebra linha (use `<textarea>` com auto-altura até 5 linhas na implementação real).
- **Menu de anexo** (acima do composer, 240px; ao abrir o seletor/câmera o bloqueio é suspenso com véu — DECISOES §4): "Foto ou vídeo — JPG, PNG, WEBP ou vídeo" (`accept="image/jpeg,image/png,image/webp,video/*"`), "Câmera" só no mobile (`capture="environment"`), "Arquivo — Até 25 MB" (vídeos até 100 MB — DECISOES §12).
- **Seletor de emoji** (264px, grade de 8 colunas, 24 emojis comuns). Não é sticker nem GIF.
- **Gravação de áudio:** o composer vira: lixeira (descartar) · pílula com ponto vermelho piscando, tempo "0:07" (tabular-nums) e "Gravando áudio…" · botão enviar. Use `MediaRecorder` (webm/opus; fallback mp4 no Safari).

**Preview antes de enviar** (modal `.dialog`, 480px): título "Enviar imagem/vídeo/arquivo/áudio", botão fechar, preview (imagem `contain` máx. 320px de altura; vídeo com chip de duração; arquivo como cartão), linha nome + tamanho, campo "Adicionar legenda…" (imagem/vídeo), ações "Cancelar" e "Enviar" (primary com ícone).

**Visualizador de mídia** (sobreposição de tela inteira, fundo bg 96% + `backdrop-filter: blur(10px)`, fade 200ms):
- Topo: nome do arquivo 14/500 + "Maria Clara · Hoje, 09:14" 12px; zoom − / "100%" / zoom + (imagem; 100–300% em passos de 50; clique na imagem alterna 100/200%); baixar; fechar (Esc).
- Vídeo: player 16:9 (máx. 920px, raio 14, `--shadow-md`) com play/pause, timeline clicável, tempo "0:12 / 1:28", mudo + volume (range), tela cheia (`requestFullscreen`). Use `<video>` nativo com controles customizados.
- Não há editor de mídia.

### 4.4 Sessão bloqueada — overlay de tela inteira no `/chat`
- Véu síncrono antes do desmonte (DECISOES §5); motivo `REOPEN` ao recarregar a página (DECISOES §7): "A página foi aberta novamente."
- **Não é um modal sobre a conversa.** Ao bloquear, o componente de mensagens é **desmontado**, o cache de mensagens no cliente é limpo e as URLs de mídia (`blob:`) são revogadas. Só a tela de bloqueio existe no DOM.
- Mesmo fundo/topo da 4.1. Ícone de cadeado em caixa 56×56, raio 14, borda 1px accent, brilho `0 0 34px accent 28%`, ícone `lock-simple` 26px.
- Título "Sessão bloqueada"; texto "Por segurança, sua conversa foi ocultada."; PIN Input; botão "Desbloquear"; rodapé 12px com avatar 28px: "Sessão de Allan Souza · bloqueada às 09:52" + motivo: "Você saiu da aba do navegador." / "A janela do navegador perdeu o foco." / "Sem atividade por 5 min." / "Bloqueada manualmente."
- Sucesso: ícone troca para `lock-simple-open` em `--nl-success`, pulso de escala 1→1.14→1 (500ms), caixas do PIN ficam verdes; após 800ms a conversa volta (sem esqueleto; recarrega mensagens do servidor).
- Mobile: ocupa 100% da viewport (`100dvh`).

### 4.5 Login do administrador — `/admin/login`
- Fundo `radial-gradient(… --color-neutral-900 …)`. Formulário máx. 360px, gap 16.
- Logo 30px + wordmark 18/500 + tag `.tag-neutral` "Admin". H3 "Entrar no NuvemLeads". Campos "E-mail" e "Senha" (`.field` + `.input`, altura 40). Botão `.btn-primary.btn-block` 42px "Entrar"; carregando: spinner + "Entrando…" e desabilitado. Links ghost "Esqueci minha senha" e "Acesso do participante". Tela de redefinir senha: DECISOES §13.
- Erro: banner 13px com ícone `warning-circle` fill, fundo `--nl-error` 12%, borda interna error 40%: **"Não foi possível entrar. Verifique seus dados."**; bordas dos campos em `--nl-error`. Mensagem genérica (não revela se o e-mail existe).

### 4.6 Admin — estrutura
- Desktop/tablet: sidebar 228px (padding 20px 14px; regra vertical que esmaece à direita) com logo, navegação (Painel `squares-four`, Usuários `users`, Configurações `gear-six`; item ativo em accent com fundo accent 10%), e no rodapé avatar 32 + nome + e-mail + botão sair `sign-out`.
- Mobile: barra superior com logo + sair e, abaixo, 3 pílulas de navegação.
- Conteúdo: padding 32px 40px 56px (mobile 18px 14px 40px), coluna máx. 880px **alinhada à esquerda**, gap 24. Títulos H2 28/500.
- Linguagem SaaS é aceitável aqui, mas sem excesso.

### 4.7 Admin — Painel `/admin`
- Rótulo 12px "NuvemLeads"; H2 "Olá, Renata"; texto "Resumo da sala privada."
- Grade `repeat(auto-fit, minmax(170px, 1fr))` gap 12 com 4 `.card.elev-sm` (padding 16): rótulo 12.5px + ícone accent; valor 30/500; meta 11px. **Usuários** "2" (2 de 2 vagas ativas) · **Mensagens** "248" · **Arquivos** "31" · **Última atividade** "09:40" (Hoje · Maria).
- "Atividade recente" (H5): últimas 5 linhas — avatar 30, "**Maria** enviou uma imagem", "Hoje, 09:14" à direita; regra que esmaece entre linhas. Frases: uma mensagem / uma imagem / um vídeo / um áudio / um arquivo. **Nunca mostrar o conteúdo das mensagens ao admin.**
- Aviso "Muitas tentativas de PIN para Maria" + "Liberar tentativas" quando aplicável (DECISOES §8).

### 4.8 Admin — Usuários `/admin/usuarios`
- H2 "Usuários" + "A conversa conecta exatamente duas pessoas ativas." + botão primary "+ Novo usuário".
- Medidor: 2 barrinhas 28×4 (accent = vaga ocupada, `--color-neutral-800` = livre) + "2 de 2 vagas ativas".
- Lista em `.card.elev-sm`: linha com avatar 44 (opacidade .6 se inativo), nome 15/500, tag `.tag-accent` "Ativo" ou `.tag-neutral` "Inativo", "Última atividade: Hoje, 09:40" 12.5px; ações "Editar" (secondary, `pencil-simple`) e "Desativar"/"Ativar" (ghost). Linha recém-alterada ganha fundo accent 7% (transição 400ms).
- **Regra:** no máximo 2 usuários Ativos. Ativar um terceiro → toast de erro "A sala já tem duas pessoas ativas."
- Desativar → modal de confirmação "Desativar Maria?" / "Essa pessoa perde o acesso à conversa até ser reativada. As mensagens são mantidas." / Cancelar · Desativar. Desativar encerra imediatamente as sessões dessa pessoa.

### 4.9 Admin — Criar / Editar usuário `/admin/usuarios/novo` e `/admin/usuarios/[id]`
- Botão ghost "← Usuários"; H2 "Novo usuário" / "Editar usuário"; `.card` máx. 540px, padding 22, gap 18.
- **Foto:** avatar 64 (foto, ou iniciais do nome digitado) + "Escolher foto" (JPG/PNG/WEBP) + "Remover".
- **Nome:** obrigatório, mín. 2 caracteres → "Informe o nome da pessoa."
- **PIN / Confirmar PIN** (lado a lado em telas largas): `type="password"`, `inputmode="numeric"`, 6 dígitos, `letter-spacing .3em`. **Nunca exibido em texto aberto** (sem botão "mostrar"). Validações: "O PIN deve ter exatamente 6 números." · "Escolha um PIN menos previsível." (6 dígitos iguais, 123456, 654321, 012345) · "Os PINs não coincidem." Nota 12px com ícone `eye-slash`.
- **Edição:** o PIN aparece como "••••••" + botão "Alterar PIN"; ao clicar, surgem os dois campos e "Manter PIN atual". Salvar com PIN novo abre o modal "Alterar o PIN de Maria?" / "O PIN atual deixa de funcionar imediatamente. Maria precisará do novo PIN no próximo desbloqueio." / Cancelar · Alterar PIN. Trocar o PIN encerra as sessões da pessoa.
- **Status:** controle `.seg` Ativo / Inativo. Erro se já houver 2 ativos: "A sala já tem duas pessoas ativas. Desative alguém ou salve como Inativo." Ao criar com 2 ativos, o padrão já vem "Inativo".
- Erros: borda do campo em `--nl-error` + texto 12px abaixo. O erro some ao editar o campo.
- **Usuário criado:** cartão com ícone check em caixa 48 (borda/brilho success, entrada pop), "Usuário criado", "Maria já pode acessar a conversa com o PIN definido." (ou variante Inativo), botões "Ver usuários" e "Criar outro". Na lista, a nova linha fica destacada.
- Na criação, gerar o **link pessoal** do usuário e exibir com botão "Copiar link" (adição de produção; ver `ARQUITETURA.md §6`).

### 4.10 Admin — Configurações `/admin/configuracoes`
- **Segurança** (`.card`, kicker "SEGURANÇA"):
  - "Tempo para bloqueio automático" + "A conversa é ocultada após esse tempo sem atividade." + `.seg` 1 min / **5 min** / 15 min / 30 min.
  - "Exigir PIN ao retornar à aba" (switch, padrão ligado) — "Bloqueia ao trocar de aba ou quando a janela perde o foco."
  - "Exigir PIN ao reabrir sessão" (switch, padrão ligado) — "Pede o PIN sempre que o navegador for reaberto."
  - Switch: 40×24, raio 12; ligado: fundo `--color-accent-700`, borda accent, bolinha 16px `--color-accent-100` deslocada 16px; desligado: `--color-neutral-800`, borda `--color-neutral-700`, bolinha `--color-neutral-400`. `role="switch"` + `aria-checked`.
- **Conta:** "Nome do administrador", "E-mail", linha "Senha — Alterada há 3 meses" + "Alterar senha" (modal: senha atual, nova, confirmar; mín. 10 caracteres).
- Botão "Salvar configurações" → toast "Configurações salvas."
- Nada além disso no MVP.

### 4.11 Componentes transversais
- **Toast:** centralizado, 96px acima da base, `--color-surface`, `--shadow-md`, raio 8, padding 10px 14px, 13.5px, ícone `check-circle` (success) ou `warning-circle` (error); some após 2.8s.
- **Modal:** `.dialog-backdrop` + `.dialog` do Nocturne (440px, raio 14, `--shadow-lg`), backdrop com blur 4px; Esc fecha.
- **Tooltip:** 11.5px, fundo `--color-neutral-800`, raio 4, padding 4px 8px, 6px acima do alvo.
- **Avatar:** círculo; iniciais 500 a 36% do tamanho. Tons: `accent` (fundo `--color-accent-800`, texto `--color-accent-200`) e `neutral` (fundo `--color-neutral-800`, texto `--color-neutral-200`). Tamanhos 24/28/30/38/44/56/64.
- **Badge/Tag:** `.tag-accent` Ativo, `.tag-neutral` Inativo, `.tag-outline` Admin; "Online" com fundo success 16% e texto `oklch(.86 .09 158)`.
- **Empty state** (conversa sem mensagens): ícone `chat-circle-dots` 30px accent, "Nenhuma mensagem ainda", "Tudo o que for enviado aqui fica visível apenas para Allan e Maria."
- **Error state:** ícone `warning-circle` 30px error, "Não foi possível carregar a conversa", "Verifique sua conexão e tente de novo.", botão "Tentar novamente".

---

## 5. Interações e comportamento

| Gatilho | Resultado |
|---|---|
| `visibilitychange` → `hidden` (se "Exigir PIN ao retornar à aba") | Véu síncrono e bloqueio imediato (motivo `tab`), exceto com seletor de arquivo/câmera aberto (DECISOES §4) |
| `window.blur` (mesma configuração) | Véu na hora; bloqueia após 1,5s se o foco não voltar — motivo `blur` (DECISOES §5) |
| Inatividade (sem `pointerdown`, `keydown`, `wheel`, `touchstart`, `mousemove`) pelo tempo configurado | Bloqueia — motivo `idle` |
| Botão "Bloquear" / menu "Bloquear agora" | Bloqueia — motivo `manual` |
| Recarregar a página, fechar e reabrir o navegador (se "Exigir PIN ao reabrir") | Começa bloqueada, motivo `REOPEN` (DECISOES §7) |
| Abrir `/chat` em outra aba | A nova aba assume; a antiga mostra "A conversa está aberta em outra aba." (DECISOES §6) |
| Bloqueio em qualquer aba | Bloqueia todas as abas do mesmo usuário (`BroadcastChannel('nuvemleads')`) |
| PIN errado ×3 | Espera de 15s (cliente) + limite no servidor (DECISOES §8) |
| Enviar texto | Bolha otimista "enviando" → "enviada" (ack do servidor) → "entregue" (outro cliente recebeu) → "lida" (outro cliente com a conversa visível e desbloqueada) |
| Offline | Mensagens de texto ficam "enviando" numa fila local e saem ao reconectar; uploads falham com "Tentar novamente" |
| Anexo acima do limite ou formato inválido | Toast de erro: "O arquivo excede o limite de 25 MB." / "O vídeo excede o limite de 100 MB." / "Formato não suportado. Use JPG, PNG ou WEBP." |

**Animações** (respeitar `prefers-reduced-motion: reduce` desligando todas, exceto mudanças de cor):

| Nome | Uso | Definição |
|---|---|---|
| msgIn | nova mensagem | 280ms ease-out, opacity 0→1, translateY 6→0 |
| rise | menus, cards, telas | 160–350ms ease-out, opacity 0→1, translateY 10→0 |
| fade | telas, overlays | 200–300ms opacity |
| pop | botão enviar/microfone, check de sucesso | 180ms, scale .6→1 + opacity |
| shake | PIN incorreto | 420ms, translateX 0,−7,6,−4,2,0 |
| unlock | ícone ao desbloquear | 500ms, scale 1→1.14→1 |
| pulse | ponto online | 2.4s infinito, box-shadow 0→6px success |
| dot | digitando | 1.2s infinito, defasagem .15s |
| shimmer | esqueleto | 1.2s infinito, opacity .45↔.9 |
| spin | spinners | 1s linear infinito |

**Responsividade** (não é só reduzir):
- **Desktop ≥ 1024px:** conversa em coluna central de 780px; header com logo e dica de bloqueio.
- **Tablet 700–1023px:** conversa usa toda a largura (padding 24); sem dica de bloqueio; admin mantém sidebar.
- **Mobile < 700px:** tela cheia (`100dvh`), header compacto (avatar + nome + status + Bloquear só ícone + menu), bolhas até 86%, mídia 232px, composer fixo no rodapé com `padding-bottom: env(safe-area-inset-bottom)`, opção "Câmera" no anexo. Com teclado aberto, use `interactive-widget=resizes-content` na meta viewport + `visualViewport` para manter composer e última mensagem visíveis. Admin com pílulas no topo.

## 6. Estado (cliente)

- `session`: `{ userId, name, avatarUrl, locked, lockReason, lockedAt }`
- `contact`: `{ id, name, avatarUrl, online, lastSeenAt, typing }`
- `messages`: lista paginada (cursor), cada item `{ id, clientId, senderId, kind: 'text'|'image'|'video'|'audio'|'file', body?, attachment?, createdAt, status: 'sending'|'sent'|'delivered'|'read'|'failed', upload?: { state: 'preparing'|'uploading'|'done'|'error', progress } }`
- `composer`: `{ text, draft?: { file, kind, previewUrl, caption }, recording?: { startedAt } }`
- `viewer`: `{ messageId, zoom }`
- `settings` (vindos do servidor): `{ autoLockMinutes, lockOnTabLeave, lockOnReopen }`
- `connection`: `'online'|'offline'|'reconnecting'`

## 7. Dados de exemplo (seed)

Usuários: **Maria Clara** (tom accent, PIN de seed `123456`) e **Allan Souza** (tom neutral, `246810`). Admin **Renata Alves** `admin@nuvemleads.com`. Mensagens: as 9 do protótipo (contrato, PDF `Contrato_revisado_v3.pdf` 2,4 MB, áudio 0:42, foto "A vista daqui de cima", vídeo 1:28…). **Trocar todos os PINs e a senha antes de publicar.**

## 8. Design tokens

Fonte: `prototipo/_ds/nocturne-…/styles.css` (copiado para `tokens/nocturne.css`). Extras do NuvemLeads em `tokens/nuvemleads.css`.

**Cores principais**

| Papel | Token | Valor |
|---|---|---|
| Primary | `--color-accent` | `#9184d9` |
| Primary Hover | `--color-accent-400` | `#b5abfc` |
| Background | `--color-bg` | `#161826` |
| Surface | `--color-surface` | `#232532` |
| Surface Secondary | `--color-neutral-900` | `#292b31` |
| Text Primary | `--color-text` | `#e9e9ed` |
| Text Secondary | `--color-neutral-500` | `#9397ab` |
| Border | `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` |
| Success / Online | `--nl-success` | `oklch(0.76 0.13 158)` |
| Warning | `--nl-warning` | `oklch(0.82 0.12 80)` |
| Error | `--nl-error` | `oklch(0.72 0.15 22)` |
| Message Sent | `--color-accent-800` (texto `--color-accent-100`) | `#423a6a` / `#f5f4ff` |
| Message Received | `--color-surface` (texto `--color-text`) | `#232532` / `#e9e9ed` |

**Rampas** — neutral: 100 `#f3f5fe` · 200 `#e4e7f5` · 300 `#cfd3e5` · 400 `#b2b6ca` · 500 `#9397ab` · 600 `#75798c` · 700 `#595d6c` · 800 `#3f424d` · 900 `#292b31`. accent: 100 `#f5f4ff` · 200 `#e7e5fe` · 300 `#d2cefd` · 400 `#b5abfc` · 500 `#968ae0` · 600 `#796cbf` · 700 `#5d5294` · 800 `#423a6a` · 900 `#2b2741`.

**Tipografia** — Inter (Google Fonts, 400/500/600). Títulos sempre 500 (nunca mais pesado).

| Estilo | Tamanho/peso | Extras |
|---|---|---|
| Display | 42 / 500 | line-height 1.12, letter-spacing −0.015em |
| Heading (H2/H3) | 28–32 / 500 · 25 / 500 | idem |
| Title | 15–17 / 500 | nomes, títulos de card |
| Body | 15 / 400 (chat 14.5) | line-height 1.55 (chat 1.45) |
| Caption | 12 / 400 | `--color-neutral-500` |
| Label | 11 / 500 | caixa-alta, letter-spacing .08–.1em |

**Espaçamento** (densidade 0.7×): `--space-1` 2.8 · `--space-2` 5.6 · `--space-3` 8.4 · `--space-4` 11.2 · `--space-6` 16.8 · `--space-8` 22.4. No protótipo foram usados também 10/12/14/16/18/20/24 px — na implementação mapeie para a escala do Tailwind (seção em `ARQUITETURA.md §4`).

**Raios:** `--radius-sm` 4 · `--radius-md` 8 · `--radius-lg` 14 · bolha 14 (rabicho 4) · pílula do composer 21 · círculos 50%.

**Sombras:** `--shadow-sm` `0 0 0 1px #3f424d` · `--shadow-md` `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)` · `--shadow-lg` `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`. Brilho do acento: `0 0 18–34px color-mix(accent 25–35%, transparent)`.

**Foco:** `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`. Desabilitado: opacidade .45.

**Dark mode:** o produto já nasce no tema escuro (Nocturne). Se no futuro houver tema claro, ele deve ser uma troca de valores das mesmas variáveis em `[data-theme="light"]`, sem nova experiência.

## 9. Assets

- **Ícones:** Phosphor (`@phosphor-icons/react`), pesos regular, bold e fill. Lista usada: lock-simple, lock-simple-open, lock-key, shield-check, dots-three-vertical, paperclip, smiley, microphone, paper-plane-right, image, camera, file, file-pdf, file-doc, file-xls, file-zip, file-text, file-csv, download-simple, play, pause, video-camera, speaker-high, speaker-slash, corners-out, magnifying-glass-plus, magnifying-glass-minus, x, check, checks, clock, warning-circle, check-circle, arrow-clockwise, wifi-slash, trash, timer, sign-out, user-gear, caret-right, users, squares-four, gear-six, pencil-simple, user-minus, user-plus, plus, arrow-left, upload-simple, eye-slash, key, password, circle-notch, chat-circle-dots.
- **Logo/símbolo/favicon:** `assets/favicon.svg` e SVG inline no protótipo (nuvem que também é balão de conversa, com um ponto + haste sugerindo fechadura; traço 1.8 em `--color-accent`). Wordmark: "Nuvem" em `--color-text` + "Leads" em `--color-accent-300`, Inter 500, letter-spacing −0.02em. Gere também `apple-touch-icon.png` 180px e `icon-512.png` a partir do SVG.
- **Foto de exemplo:** `assets/photo.jpg` (vinda do design system; só para seed/demo).

## 10. Arquivos deste pacote

```
design_handoff_nuvemleads/
├── DECISOES.md               ← decisões e correções (prevalece)
├── README.md                 ← este arquivo (design e comportamento)
├── ARQUITETURA.md            ← stack, banco, API, tempo real, segurança
├── HOSPEDAGEM_HOSTINGER.md   ← plano recomendado e deploy passo a passo
├── PROMPTS_CLAUDE_CODE.md    ← sequência de prompts para gerar o sistema
├── screenshots/            ← 20 capturas do protótipo (desktop, tablet, mobile)
├── tokens/
│   ├── nocturne.css          ← tokens e classes do design system
│   └── nuvemleads.css        ← tokens extras + mapeamento Tailwind
└── prototipo/
    ├── NuvemLeads.dc.html    ← protótipo navegável (referência)
    ├── support.js            ← runtime do protótipo
    ├── assets/               ← favicon.svg, photo.jpg
    └── _ds/…/styles.css      ← Nocturne
```
