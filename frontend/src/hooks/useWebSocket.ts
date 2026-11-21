import { useEffect, useState } from "react";
import { WebSocketClient, WS_URL } from "@/lib/websocket";

type MessageHandler = (msg: any) => void;
type StatusHandler = (status: "connected" | "disconnected") => void;

let sharedClient: WebSocketClient | null = null;
const messageListeners = new Set<MessageHandler>();
const statusListeners = new Set<StatusHandler>();
let currentStatus: "connected" | "disconnected" = "disconnected";

function getSharedClient(): WebSocketClient {
  if (!sharedClient) {
    sharedClient = new WebSocketClient(
      WS_URL,
      (msg) => {
        messageListeners.forEach((fn) => fn(msg));
      },
      (s) => {
        currentStatus = s;
        statusListeners.forEach((fn) => fn(s));
      }
    );
  }
  return sharedClient;
}

export function useWebSocket() {
  const [status, setStatus] = useState<"connected" | "disconnected">("disconnected");
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    const client = getSharedClient();
    setStatus(currentStatus);

    const handleMessage = (msg: any) => setLastMessage(msg);
    const handleStatus = (s: "connected" | "disconnected") => setStatus(s);

    messageListeners.add(handleMessage);
    statusListeners.add(handleStatus);

    client.connect();

    return () => {
      messageListeners.delete(handleMessage);
      statusListeners.delete(handleStatus);
      if (messageListeners.size === 0) {
        client.disconnect();
        sharedClient = null;
      }
    };
  }, []);

  return { status, lastMessage };
}
