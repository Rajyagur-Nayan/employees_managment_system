"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  API_URL,
  startCamera,
  stopCamera,
  getEmployees,
  manualAttendanceCheckIn,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Video,
  User,
  UserX,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Edit3,
} from "lucide-react";

export default function LiveMonitoring() {
  const { status, lastMessage } = useWebSocket();
  const [activities, setActivities] = useState<any[]>([]);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastConfirmed, setLastConfirmed] = useState<any | null>(null);
  const [verifyingMap, setVerifyingMap] = useState<Record<string, number>>({});

  // Manual Check-in Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [manualEmpId, setManualEmpId] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    getEmployees().then(setEmployees).catch(console.error);
    // Auto-start laptop camera on attendance screen
    startCamera()
      .then(() => setIsCameraRunning(true))
      .catch((err) => console.log("Laptop camera auto-start:", err));
  }, []);

  useEffect(() => {
    if (lastMessage?.type === "system") {
      if (lastMessage.status === "running") {
        setIsCameraRunning(true);
        setCameraError(null);
      } else if (lastMessage.status === "error") {
        setIsCameraRunning(false);
        setCameraError(lastMessage.message || "Laptop camera error");
      } else if (lastMessage.status === "stopped") {
        setIsCameraRunning(false);
      }
    }

    if (lastMessage?.type === "verifying") {
      setVerifyingMap((prev) => ({
        ...prev,
        [lastMessage.employee_id]: lastMessage.frames,
      }));
    }

    if (
      lastMessage &&
      (lastMessage.type === "attendance" ||
        lastMessage.type === "unknown" ||
        lastMessage.type === "liveness_failed")
    ) {
      setActivities((prev) => [lastMessage, ...prev].slice(0, 20));

      if (
        lastMessage.type === "attendance" &&
        lastMessage.status === "CONFIRMED"
      ) {
        setLastConfirmed(lastMessage);
        // Clear verifying state
        setVerifyingMap((prev) => {
          const next = { ...prev };
          delete next[lastMessage.employee_id];
          return next;
        });
      }
    }
  }, [lastMessage]);

  const toggleCamera = async () => {
    try {
      if (isCameraRunning) {
        await stopCamera();
        setIsCameraRunning(false);
      } else {
        setCameraError(null);
        await startCamera();
        setIsCameraRunning(true);
      }
    } catch (e: any) {
      console.error(e);
      setCameraError(e.message || "Failed to toggle camera");
    }
  };

  const submitManualCheckIn = async () => {
    if (!manualEmpId) return;
    setManualLoading(true);
    try {
      const res = await manualAttendanceCheckIn(
        manualEmpId,
        "supervisor",
        manualNote || "Manual override",
      );
      setLastConfirmed({
        employee_id: res.employee_id,
        employee_name: res.name,
        confidence: 1.0,
        status: "MANUAL",
        is_duplicate: res.is_duplicate,
        timestamp: format(new Date(), "HH:mm:ss"),
        message: res.is_duplicate
          ? "Already checked in today"
          : "Manual attendance recorded",
      });
      setShowManualModal(false);
      setManualNote("");
      if (res.is_duplicate) {
        toast.info(`Already Marked Present: ${res.name}`, {
          description: `Employee ID: ${res.employee_id} • Marked as duplicate for today.`,
        });
      } else {
        toast.success(`Manual Attendance Recorded: ${res.name}`, {
          description: `Employee ID: ${res.employee_id} • Time: ${format(new Date(), "HH:mm:ss")}`,
        });
      }
    } catch (err: any) {
      toast.error("Manual Check-in Failed", {
        description: err.message,
      });
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-emerald-500" /> Live Attendance
            Monitoring
          </h2>
          <div className="flex items-center gap-2 text-neutral-400 mt-1">
            <span>Camera: Laptop Camera</span>
            {isCameraRunning ? (
              <span className="flex items-center gap-1 text-emerald-500 font-medium text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE STREAMING
              </span>
            ) : (
              <span className="text-neutral-500 font-medium flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-neutral-500"></span>
                OFFLINE
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 text-neutral-300 hover:text-white"
          >
            <Edit3 className="w-4 h-4" /> Manual Check-in
          </Button>

          <Button
            variant={isCameraRunning ? "destructive" : "default"}
            onClick={toggleCamera}
            className={
              !isCameraRunning
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : ""
            }
          >
            {isCameraRunning ? "Stop Camera" : "Start Camera"}
          </Button>
        </div>
      </div>

      {/* Camera Error Notice */}
      {cameraError && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Confirmation Banner for Last Scanned Employee */}
      {lastConfirmed && (
        <Card
          className={`border ${lastConfirmed.is_duplicate ? "bg-neutral-900 border-neutral-700" : "bg-emerald-950/30 border-emerald-500/30"} p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${lastConfirmed.is_duplicate ? "bg-neutral-800 text-neutral-400" : "bg-emerald-500/20 text-emerald-400"}`}
              >
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {lastConfirmed.employee_name}
                  </h3>
                  <span className="text-xs font-mono text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
                    {lastConfirmed.employee_id}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${lastConfirmed.is_duplicate ? "bg-neutral-800 text-neutral-400" : "bg-emerald-500/20 text-emerald-400"}`}
                  >
                    {lastConfirmed.is_duplicate
                      ? "Already Checked In"
                      : "Attendance Verified"}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Check-in confirmed at {lastConfirmed.timestamp} | Match
                  confidence:{" "}
                  {((lastConfirmed.confidence || 1) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastConfirmed(null)}
              className="text-xs text-neutral-500 hover:text-white"
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {/* Main Grid: Stream + Recognition Events */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Stream View */}
        <Card className="lg:col-span-2 bg-neutral-900 border-neutral-800 overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b border-neutral-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-500" /> Laptop Camera
              Preview
            </CardTitle>
            <span className="text-xs text-neutral-500">
              Multi-Frame Confirmation: 3 frames
            </span>
          </CardHeader>
          <div className="flex-1 bg-black flex items-center justify-center relative min-h-[420px]">
            {isCameraRunning ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={`${API_URL}/api/camera/stream`}
                alt="Live Camera Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23111"><rect width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23555">Laptop Camera Stream Initializing...</text></svg>';
                }}
              />
            ) : (
              <div className="text-neutral-600 flex flex-col items-center gap-2 p-8 text-center">
                <Video className="w-12 h-12 opacity-20" />
                <p className="text-sm">Laptop camera is currently stopped.</p>
                <p className="text-xs text-neutral-500">
                  Click &quot;Start Camera&quot; and show the employee face to
                  verify attendance.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Right: Recognition Events Stream */}
        <Card className="bg-neutral-900 border-neutral-800 flex flex-col h-[500px]">
          <CardHeader className="py-3 px-4 border-b border-neutral-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live Recognition Events
            </CardTitle>
            <span className="text-xs text-neutral-500">
              {activities.length} events
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1">
            <div className="divide-y divide-neutral-800">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">
                  Waiting for detection events...
                </div>
              ) : (
                activities.map((act, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-start gap-3 hover:bg-neutral-800/50 transition-colors"
                  >
                    {act.type === "attendance" && (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${act.is_duplicate ? "bg-neutral-800 text-neutral-400" : "bg-emerald-500/10 text-emerald-400"}`}
                      >
                        <User className="w-4 h-4" />
                      </div>
                    )}
                    {act.type === "unknown" && (
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
                        <UserX className="w-4 h-4" />
                      </div>
                    )}
                    {act.type === "liveness_failed" && (
                      <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">
                          {act.type === "attendance"
                            ? act.employee_name
                            : act.type === "unknown"
                              ? "Unknown Face"
                              : "Spoof Detected"}
                        </p>
                        <span className="text-xs font-mono text-neutral-500">
                          {act.timestamp || format(new Date(), "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {act.type === "attendance"
                          ? `${act.employee_id} | ${act.message} (${((act.confidence || 0) * 100).toFixed(0)}%)`
                          : act.message}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Check-In Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <Card className="bg-neutral-900 border-neutral-800 max-w-md w-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" /> Authorized Manual
                Check-In
              </CardTitle>
              <CardDescription className="text-neutral-400">
                Mark attendance when camera is offline or facial recognition
                fails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-neutral-300">
                  Select Employee
                </Label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.employee_id}>
                      {emp.employee_id} - {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-neutral-300">
                  Reason / Notes
                </Label>
                <Input
                  placeholder="e.g. Employee badge verification / Camera issue"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  className="bg-neutral-950 border-neutral-800 text-white mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitManualCheckIn}
                  disabled={manualLoading || !manualEmpId}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {manualLoading ? "Marking..." : "Confirm Attendance"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
