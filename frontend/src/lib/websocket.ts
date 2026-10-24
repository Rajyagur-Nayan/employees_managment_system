export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/attendance";

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: (msg: any) => void;
  private onStatusChange: (status: "connected" | "disconnected") => void;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private reconnectTimer: any = null;

  constructor(
    url: string,
    onMessage: (msg: any) => void,
    onStatusChange: (status: "connected" | "disconnected") => void
  ) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.reconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onStatusChange("connected");
      console.log(`[WS] Connected to ${this.url}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    this.ws.onclose = () => {
      this.onStatusChange("disconnected");
      if (!this.isExplicitlyClosed) {
        this.reconnect();
      }
    };

    this.ws.onerror = () => {
      // Browsers don't provide details in onerror for security reasons.
      // onclose will be triggered immediately following this.
      this.ws?.close();
    };
  }

  private reconnect() {
    if (this.isExplicitlyClosed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    // Exponential backoff capped at 5 seconds
    const delay = Math.min(5000, 1000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 5)));

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
