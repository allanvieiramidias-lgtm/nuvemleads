// Next.js + Socket.IO no mesmo http.Server (ARQUITETURA §1 e §8).
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server as SocketServer } from "socket.io";
import { attachRealtime } from "./src/server/realtime";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  void handle(req, res);
});

const io = new SocketServer(httpServer, {
  path: "/socket.io",
  serveClient: false,
  cors: { origin: false },
  // reconexão rápida depois de quedas curtas (celular trocando de rede)
  connectionStateRecovery: { maxDisconnectionDuration: 30_000 },
});
attachRealtime(io);

httpServer.listen(port, hostname, () => {
  console.log(`> NuvemLeads em http://localhost:${port} (${dev ? "dev" : "produção"})`);
});

const shutdown = () => {
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
