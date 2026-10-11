// Next.js + Socket.IO no mesmo http.Server (ARQUITETURA §1 e §8).
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server as SocketServer } from "socket.io";

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
  // mesma origem; o CSRF de handshake é feito na Etapa 6
  cors: { origin: false },
});

// Autenticação, salas por conversa e eventos chegam na Etapa 6.
io.on("connection", (socket) => {
  socket.disconnect(true);
});

httpServer.listen(port, hostname, () => {
  console.log(`> NuvemLeads em http://localhost:${port} (${dev ? "dev" : "produção"})`);
});

const shutdown = () => {
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
