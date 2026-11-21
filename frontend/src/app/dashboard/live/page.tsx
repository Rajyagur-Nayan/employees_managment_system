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
  const [streamKey, setStreamKey] = useState<number>(Date.now());

  // Manual Check-in Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [manualEmpId, setManualEmpId] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const cleanupCameraMedia = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    getEmployees().then(setEmployees).catch(console.error);
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
        cleanupCameraMedia();
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

      if (lastMessage.type === "attendance") {
        setLastConfirmed(lastMessage);
        // Clear verifying state
        setVerifyingMap((prev) => {
          const next = { ...prev };
          delete next[lastMessage.employee_id];
          return next;
        });

        const statusMessage = lastMessage.is_duplicate
          ? `Attendance already recorded for ${lastMessage.employee_name}.`
          : `Attendance marked for ${lastMessage.employee_name}!`;

        // Automatically close the camera once attendance is marked or verified
        setTimeout(async () => {
          try {
            await stopCamera();
          } catch (_) {}
          cleanupCameraMedia();
          setIsCameraRunning(false);
          toast.info(`${statusMessage} Camera closed automatically.`);
        }, 1200);
      }
    }
  }, [lastMessage]);

  const toggleCamera = async () => {
    try {
      if (isCameraRunning) {
        await stopCamera();
        cleanupCameraMedia();
        setIsCameraRunning(false);
      } else {
        setCameraError(null);
        setStreamKey(Date.now());
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
      // Close camera if running
      if (isCameraRunning) {
        try {
          await stopCamera();
        } catch (_) {}
        setIsCameraRunning(false);
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Video className="w-6 h-6 text-emerald-600" /> Live Attendance Monitoring
          </h2>
          <div className="flex items-center gap-2 text-slate-500 mt-1 text-xs">
            <span>Camera: Laptop Camera</span>
            {isCameraRunning ? (
              <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE STREAMING
              </span>
            ) : (
              <span className="text-slate-500 font-medium flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                OFFLINE
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 text-[#111111] bg-white border-[#E5E7EB] hover:bg-neutral-100 text-xs font-semibold shadow-xs"
          >
            <Edit3 className="w-4 h-4 text-neutral-600" /> Manual Check-in
          </Button>

          <Button
            onClick={toggleCamera}
            className={
              !isCameraRunning
                ? "bg-[#111111] hover:bg-neutral-800 text-white font-semibold text-xs shadow-xs"
                : "bg-white border border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 font-semibold text-xs shadow-xs"
            }
          >
            {isCameraRunning ? "Stop Camera" : "Start Camera"}
          </Button>
        </div>
      </div>

      {/* Camera Error Notice */}
      {cameraError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3 text-sm shadow-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Confirmation Banner for Last Scanned Employee */}
      {lastConfirmed && (
        <Card
          className={`border shadow-xs ${lastConfirmed.is_duplicate ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"} p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${lastConfirmed.is_duplicate ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
              >
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {lastConfirmed.employee_name}
                  </h3>
                  <span className="text-xs font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                    {lastConfirmed.employee_id}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                      lastConfirmed.is_duplicate 
                        ? "bg-amber-100/60 text-amber-800 border-amber-300" 
                        : "bg-emerald-100/60 text-emerald-800 border-emerald-300"
                    }`}
                  >
                    {lastConfirmed.is_duplicate
                      ? "Attendance already marked for today."
                      : "Attendance Verified"}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Check-in confirmed at {lastConfirmed.timestamp} | Match confidence:{" "}
                  {((lastConfirmed.confidence || 1) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastConfirmed(null)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {/* Main Grid: Stream + Recognition Events */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Stream View */}
        <Card className="lg:col-span-2 bg-white border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between bg-white">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-600" /> Laptop Camera Preview
            </CardTitle>
            <span className="text-xs text-slate-500 font-medium">
              Multi-Frame Confirmation: 3 frames
            </span>
          </CardHeader>
          <div className="flex-1 bg-slate-950 flex items-center justify-center relative min-h-[420px]">
            {isCameraRunning ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={`${API_URL}/api/camera/stream?t=${streamKey}`}
                alt="Live Camera Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23111"><rect width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23555">Laptop Camera Stream Initializing...</text></svg>';
                }}
              />
            ) : (
              <div className="text-slate-400 flex flex-col items-center gap-2 p-8 text-center">
                <Video className="w-12 h-12 opacity-30 text-slate-500" />
                <p className="text-sm text-slate-300 font-medium">Laptop camera is currently stopped.</p>
                <p className="text-xs text-slate-500">
                  Click &quot;Start Camera&quot; and show the employee face to verify attendance.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Right: Recognition Events Stream */}
        <Card className="bg-white border-slate-200/90 shadow-xs flex flex-col h-[500px]">
          <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between bg-white">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" /> Live Detection Stream
            </CardTitle>
            <span className="text-xs text-slate-500 font-medium">
              {activities.length} events
            </span>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1">
            <div className="divide-y divide-slate-100 bg-white">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  Waiting for detection events...
                </div>
              ) : (
                activities.map((act, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-start gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    {act.type === "attendance" && (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          act.is_duplicate 
                            ? "bg-amber-100 text-amber-700" 
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        <User className="w-4 h-4" />
                      </div>
                    )}
                    {act.type === "unknown" && (
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                        <UserX className="w-4 h-4" />
                      </div>
                    )}
                    {act.type === "liveness_failed" && (
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          {act.type === "attendance"
                            ? act.employee_name
                            : act.type === "unknown"
                              ? "Unknown Face"
                              : "Spoof Detected"}
                        </p>
                        <span className="text-xs font-mono text-slate-400">
                          {act.timestamp || format(new Date(), "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-slate-200 shadow-xl max-w-md w-full">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-slate-900 flex items-center gap-2 text-base font-bold">
                <Edit3 className="w-4 h-4 text-emerald-600" /> Authorized Manual Check-In
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Mark attendance when camera is offline or facial recognition fails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="text-xs text-slate-700 font-semibold">
                  Select Employee
                </Label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white"
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
                <Label className="text-xs text-slate-700 font-semibold">
                  Reason / Notes
                </Label>
                <Input
                  placeholder="e.g. Employee badge verification / Camera issue"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-slate-900 mt-1.5 text-xs focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualModal(false)}
                  className="text-xs border-[#E5E7EB] text-[#111111]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitManualCheckIn}
                  disabled={manualLoading || !manualEmpId}
                  className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs"
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
