import { startServer } from "./server/start";
import { chatWebSocketHandler } from "./server/chat-socket";

const server = startServer({ websocket: chatWebSocketHandler });
console.log(`Server is running on http://localhost:${server.port}`);
