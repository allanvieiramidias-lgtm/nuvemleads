# NuvemLeads — Hospedagem na Hostinger

> `DECISOES.md` prevalece em caso de conflito.

## 1. Qual plano usar

### Recomendado: **VPS KVM 1 ou KVM 2** (Ubuntu 24.04 + Docker)

O NuvemLeads precisa de três coisas que um site comum não precisa:

1. **Um processo Node sempre ligado** com WebSocket (mensagens, "digitando", presença em tempo real).
2. **Disco persistente** para fotos, vídeos, áudios e arquivos (até 25 MB cada), que não pode sumir a cada deploy.
3. **Controle de segurança** (cabeçalhos, limite de upload, banco não exposto, backups).

O VPS atende os três sem adaptações. Como a imagem é gerada no GitHub Actions (DECISOES §15), o **KVM 1 (1 vCPU / 4 GB)** já roda o sistema para duas pessoas; o **KVM 2 (2 vCPU / 8 GB / 100 GB NVMe)** dá folga para converter vídeos com `ffmpeg` e guardar anos de mídia. Escolha o data center mais próximo das duas pessoas.

Stack no servidor: **Docker Compose** com 3 serviços — `app` (Next.js + Socket.IO), `db` (PostgreSQL 16) e `caddy` (HTTPS automático Let's Encrypt + proxy com WebSocket).

### Alternativa: hospedagem **Business** ou **Cloud** com "Node.js Web Apps"

Esses planos fazem deploy de Next.js direto do GitHub pelo hPanel, com SSL gerenciado. Funciona para o NuvemLeads **com estas adaptações**:

| Item | No VPS | Na Web App gerenciada |
|---|---|---|
| Banco | PostgreSQL no Docker | **MySQL do hPanel** (no Drizzle, trocar para `drizzle-orm/mysql-core`) |
| Tempo real | Socket.IO | **Confirmar com o suporte se WebSocket é suportado.** Se não for: Server-Sent Events ou polling a cada 3 s em `/api/messages?after=` |
| Uploads | Volume Docker | Pasta fora do diretório de build (confirmar que persiste entre deploys) ou armazenamento S3-compatível |
| ffmpeg | Instalado na imagem | Normalmente indisponível → gerar capa e duração do vídeo no navegador (canvas + `<video>.duration`) |
| Cabeçalhos/limites | Caddy | `next.config.ts` |

Use a alternativa só se você não quiser administrar um servidor. Para o produto descrito, o **VPS é a opção indicada**.

## 2. Preparar o VPS

1. No hPanel → VPS → **Sistema operacional**: escolha o template **Ubuntu 24.04 com Docker** (ou Ubuntu 24.04 puro e instale o Docker no passo 4).
2. **DNS:** no domínio, crie um registro `A` para `chat` (ou o subdomínio escolhido) apontando para o IP do VPS. Se usar IPv6, um `AAAA` também.
3. Acesse por SSH como root e crie um usuário:
   ```bash
   adduser deploy && usermod -aG sudo deploy
   mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
   chown -R deploy:deploy /home/deploy/.ssh
   ```
   Em `/etc/ssh/sshd_config`: `PermitRootLogin no` e `PasswordAuthentication no` → `systemctl restart ssh`.
4. Firewall e atualizações:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
   sudo ufw enable
   sudo apt update && sudo apt install -y fail2ban unattended-upgrades git
   sudo dpkg-reconfigure -plow unattended-upgrades
   # se o template não trouxer Docker:
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker deploy
   ```
   Obs.: o `ufw` não filtra portas publicadas pelo Docker; por isso só o Caddy publica portas.
   Também ative o firewall do próprio hPanel com as mesmas portas.

## 3. Arquivos de deploy (ficam na raiz do repositório)

### `Dockerfile`
```dockerfile
# Versões: DECISOES §1. Imagem gerada no GitHub Actions (DECISOES §15).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 1001 app && mkdir -p /data/uploads && chown app /data/uploads
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=app /app/package.json ./
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/drizzle ./drizzle
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/dist ./dist
USER app
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
```
(`npm run build` roda `next build` e compila `server.ts`, `scripts/migrate.ts` e `scripts/seed.ts` para `dist/` com `tsup`. Sem binários de ORM: DECISOES §17.)

### `docker-compose.yml`
```yaml
services:
  app:
    image: ghcr.io/SEU_USUARIO/nuvemleads:latest   # gerada pelo GitHub Actions
    restart: unless-stopped
    env_file: .env
    volumes:
      - uploads:/data/uploads
    depends_on:
      db:
        condition: service_healthy
    expose: ["3000"]

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: nuvemleads
      POSTGRES_USER: nuvem
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nuvem -d nuvemleads"]
      interval: 5s
      retries: 10
    # sem "ports": o banco nunca fica exposto à internet

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [app]

volumes:
  uploads:
  pgdata:
  caddy_data:
  caddy_config:
```

### `Caddyfile`
```
chat.seudominio.com.br {
  encode zstd gzip
  request_body {
    max_size 101MB
  }
  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    X-Frame-Options "DENY"
    Permissions-Policy "camera=(self), microphone=(self), geolocation=()"
    -Server
  }
  reverse_proxy app:3000
}
```
O Caddy já repassa WebSocket e emite/renova o certificado sozinho. A CSP (com nonce) é aplicada pelo `proxy.ts` do app (DECISOES §14).

## 4. Primeiro deploy

No VPS só ficam `docker-compose.yml`, `Caddyfile` e `.env` — o código não precisa estar lá.

```bash
ssh deploy@IP_DO_VPS
mkdir -p ~/nuvemleads && cd ~/nuvemleads
# copie docker-compose.yml e Caddyfile do repositório (scp ou cole com nano)
nano .env                                   # preencha tudo (ver ARQUITETURA.md §10)
SENHA=$(openssl rand -hex 32)               # hex: sem / nem +, seguro dentro da DATABASE_URL
echo "POSTGRES_PASSWORD=$SENHA" >> .env
echo "DATABASE_URL=postgresql://nuvem:$SENHA@db:5432/nuvemleads" >> .env
# login no GHCR com um token (classic) só com read:packages
echo TOKEN | docker login ghcr.io -u SEU_USUARIO --password-stdin
docker compose pull && docker compose up -d
docker compose exec app node dist/seed.js  # cria o admin e as configurações padrão
docker compose logs -f app
```
Abra `https://chat.seudominio.com.br/admin/login`, entre com o admin do seed, **troque a senha**, crie as duas pessoas com PINs novos e copie os links pessoais. Se o DNS ainda não tiver propagado, o Caddy tenta o certificado de novo sozinho.

## 5. Atualizações

Manual:
```bash
cd ~/nuvemleads && docker compose pull && docker compose up -d && docker image prune -f
```

Automática com GitHub Actions (`.github/workflows/deploy.yml`): gera a imagem, publica no GHCR e atualiza o VPS.
```yaml
name: deploy
on: { push: { branches: [main] } }
permissions: { contents: read, packages: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest,ghcr.io/${{ github.repository }}:${{ github.sha }}
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: cd ~/nuvemleads && docker compose pull app && docker compose up -d && docker image prune -f
```
Segredos do repositório: `VPS_HOST` (IP) e `VPS_SSH_KEY` (chave privada de um par criado só para o deploy; a pública vai em `~/.ssh/authorized_keys` do usuário `deploy`). O nome da imagem no GHCR fica em minúsculas.

## 6. Backups

1. **Snapshot do VPS** no hPanel (antes de cada atualização grande).
2. **Backup diário** do banco e dos uploads, mantendo 14 dias — `crontab -e` do usuário `deploy`:
   ```
   0 3 * * * cd ~/nuvemleads && mkdir -p ~/backups && docker compose exec -T db pg_dump -U nuvem nuvemleads | gzip > ~/backups/db-$(date +\%F).sql.gz && docker run --rm -v nuvemleads_uploads:/u -v ~/backups:/b alpine tar czf /b/uploads-$(date +\%F).tgz -C /u . && find ~/backups -mtime +14 -delete
   ```
3. Recomendado: copiar `~/backups` para fora do servidor (por exemplo com `rclone` para um armazenamento externo), já que o conteúdo é privado — criptografe com `rclone crypt` ou `gpg`.
4. Teste a restauração uma vez: `gunzip -c db-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -U nuvem nuvemleads`.

## 7. E-mail (recuperação de senha do admin)

Crie a caixa `nao-responda@seudominio.com.br` no hPanel → E-mails. Use `smtp.hostinger.com`, porta `465` (SSL) e a senha dessa caixa nas variáveis `SMTP_*`.

## 8. Monitoramento

- `docker compose ps` e `docker compose logs --tail=200 app`.
- Um monitor de disponibilidade apontando para `https://chat.seudominio.com.br/api/health` (rota que responde `200` sem dados).
- Acompanhar uso de disco: `df -h` e `docker system df` (a mídia cresce com o tempo).

## 9. Checklist antes de entregar

- [ ] HTTPS ativo e nota A em um teste de cabeçalhos de segurança
- [ ] Senha do admin do seed trocada; PINs de exemplo não existem em produção
- [ ] `PUBLIC_PICKER=false` (acesso só pelos links pessoais)
- [ ] Porta 5432 não acessível de fora (`nmap` do seu computador)
- [ ] Arquivo de 26 MB e vídeo de 101 MB recusados; vídeo HEVC do iPhone toca no Android; `.exe` recusado; foto com GPS chega sem EXIF
- [ ] Trocar de aba bloqueia; voltar pede PIN; `GET /api/messages` com sessão bloqueada retorna 423
- [ ] Backup diário gerado e restauração testada
