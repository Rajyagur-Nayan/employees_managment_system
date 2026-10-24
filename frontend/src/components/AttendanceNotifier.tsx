"use client";

import { useEffect, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { toast } from "sonner";

export function AttendanceNotifier() {
  const { lastMessage } = useWebSocket();
  const lastKeyRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!lastMessage) return;

    const now = Date.now();

    if (
      lastMessage.type === "attendance" &&
      (lastMessage.status === "CONFIRMED" || !lastMessage.status)
    ) {
      const key = `att_${lastMessage.employee_id}_${lastMessage.date || ""}_${lastMessage.is_duplicate}`;
      // Prevent repeated toasts for the same confirmation within 3 seconds
      if (key === lastKeyRef.current && now - lastTimeRef.current < 3000) {
        return;
      }
      lastKeyRef.current = key;
      lastTimeRef.current = now;

      const name =
        lastMessage.employee_name || `Employee ${lastMessage.employee_id}`;
      const time = lastMessage.timestamp || new Date().toLocaleTimeString();
      const conf = lastMessage.confidence
        ? `${Math.round(lastMessage.confidence * 100)}%`
        : "Verified";

      if (lastMessage.is_duplicate) {
        toast.info(`Duplicate Check-in: ${name}`, {
          description: `${lastMessage.employee_id} is already marked present today.`,
          duration: 4000,
        });
      } else {
        toast.success(`Attendance Marked: ${name}`, {
          description: `ID: ${lastMessage.employee_id} • Time: ${time} • Confidence: ${conf}`,
          duration: 5000,
        });
      }
    } else if (lastMessage.type === "liveness_failed") {
      const key = `liveness_${lastMessage.track_id || 0}`;
      if (key === lastKeyRef.current && now - lastTimeRef.current < 5000) {
        return;
      }
      lastKeyRef.current = key;
      lastTimeRef.current = now;

      toast.error("Spoofing / Liveness Check Failed", {
        description:
          "Static photograph or screen detected. Attendance not marked.",
        duration: 5000,
      });
    }
  }, [lastMessage]);

  return null;
}
