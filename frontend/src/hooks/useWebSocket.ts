import { useEffect, useState, useRef } from "react";
import { WebSocketClient, WS_URL } from "@/lib/websocket";

export function useWebSocket() {
  const [status, setStatus] = useState<"connected" | "disconnected">("disconnected");
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    wsClientRef.current = new WebSocketClient(
      WS_URL,
      (msg) => setLastMessage(msg),
      (s) => setStatus(s)
    );
    
    wsClientRef.current.connect();

    return () => {
      wsClientRef.current?.disconnect();
    };
  }, []);

  return { status, lastMessage };
}
