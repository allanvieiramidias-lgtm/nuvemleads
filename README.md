# NuvemLeads

Mensageiro web privado para duas pessoas, com bloqueio por PIN.
Especificação completa em [`docs/handoff/`](docs/handoff/) — comece por `DECISOES.md`.

## Rodar localmente

Requisitos: Node 22 e PostgreSQL 16 (via Docker com `npm run db:dev`, ou instalado na máquina).

```bash
cp .env.example .env
npm install
npm run db:dev        # Postgres em localhost:5432 (Docker)
npm run db:migrate    # aplica as migrações de drizzle/
npm run db:seed
npm run dev           # http://localhost:3000 (Next + Socket.IO)
```

## Verificar

```bash
npm run typecheck && npm run lint && npm test
npx playwright install chromium   # uma vez
npx playwright test
npm run build && npm start        # produção local
```

## Publicar

Ver `docs/handoff/HOSPEDAGEM_HOSTINGER.md` (VPS Hostinger + Docker + Caddy, imagem gerada no GitHub Actions).
