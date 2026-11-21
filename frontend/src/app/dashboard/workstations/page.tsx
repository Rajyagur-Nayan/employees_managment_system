"use client";

import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Monitor,
  User,
  Clock,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Timer,
  Edit2,
  RefreshCw,
  Video,
  Coffee,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  API_URL,
  getWorkstations,
  getEmployees,
  startWorkstationSession,
  stopWorkstationSession,
  getWorkstationIntervals,
  updateWorkstation,
  correctWorkstationInterval,
  resetWorkstationTodayTime,
  startWorkstationBreak,
  stopWorkstationBreak,
  startWorkstationCamera,
  stopWorkstationCamera,
  getWorkstationCameraStatus,
  getAlertConfig,
  updateAlertConfig,
  updateWorkstationThreshold,
} from "@/lib/api";
import { toast } from "sonner";

export default function WorkstationsPage() {
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [intervals, setIntervals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSystemRunning, setIsSystemRunning] = useState<boolean>(false);
  const [systemActionLoading, setSystemActionLoading] = useState<boolean>(false);
  const [editingInterval, setEditingInterval] = useState<any | null>(null);
  const [correctionDuration, setCorrectionDuration] = useState<string>("");
  const [correctionNote, setCorrectionNote] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("General Shift");
  const [breakModalOpen, setBreakModalOpen] = useState<boolean>(false);
  const [breakType, setBreakType] = useState<string>("Lunch Break");
  const [breakNotes, setBreakNotes] = useState<string>("");
  const [breakLoading, setBreakLoading] = useState<boolean>(false);

  // Absence Alert Threshold State (Configurable: 5m, 10m, 15m default, 20m, 30m, custom)
  const [absenceThresholdMin, setAbsenceThresholdMin] = useState<number>(15);
  const [showCustomThreshold, setShowCustomThreshold] = useState<boolean>(false);
  const [customThresholdInput, setCustomThresholdInput] = useState<string>("");
  const [backendConnected, setBackendConnected] = useState<boolean>(true);
  const [wsStreamKey, setWsStreamKey] = useState<number>(Date.now());

  // Telemetry state
  const [telemetry, setTelemetry] = useState<any>({
    is_monitoring: false,
    status: "STOPPED",
    employee_id: null,
    employee_name: null,
    total_active_seconds: 0,
    total_active_formatted: "00h 00m 00s",
    grace_remaining_seconds: 0,
    grace_period_total: 60,
    last_confirmed_presence: "None",
    is_camera_connected: true,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const lastTelemetryUpdateRef = useRef<number>(0);
  const lastTelemetryStatusRef = useRef<string>("");

  // 1. Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [wsList, empList, camStatus, alertConfig] = await Promise.all([
        getWorkstations(),
        getEmployees(),
        getWorkstationCameraStatus().catch(() => ({ status: "stopped" })),
        getAlertConfig().catch(() => ({ absence_threshold_minutes: 15 })),
      ]);
      setBackendConnected(true);
      setWorkstations(wsList);
      setEmployees(empList);
      if (wsList.length > 0) {
        setSelectedWsId(wsList[0].id);
        if (wsList[0].alert_threshold_seconds) {
          setAbsenceThresholdMin(Math.round(wsList[0].alert_threshold_seconds / 60));
        } else if (alertConfig?.absence_threshold_minutes) {
          setAbsenceThresholdMin(alertConfig.absence_threshold_minutes);
        }
      } else if (alertConfig?.absence_threshold_minutes) {
        setAbsenceThresholdMin(alertConfig.absence_threshold_minutes);
      }
      if (empList.length > 0) {
        setSelectedEmpId(empList[0].employee_id);
      }
      if (camStatus?.status === "running") {
        setIsSystemRunning(true);
      }
    } catch (err: any) {
      if (err?.message?.includes("Unable to connect to backend server") || err?.name === "TypeError") {
        setBackendConnected(false);
      }
      console.warn("Workstation initial load notice (backend offline):", err?.message || err);
    }
  };

  // 2. Setup WebSocket connection for live telemetry
  useEffect(() => {
    const defaultWs = "ws://127.0.0.1:8000/ws/workstation";
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL
      ? process.env.NEXT_PUBLIC_WS_URL.replace("://localhost:", "://127.0.0.1:").replace("/ws/attendance", "/ws/workstation")
      : defaultWs;

    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isClosed = false;

    const connectWs = () => {
      if (isClosed) return;
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "telemetry") {
              const now = Date.now();
              const statusChanged = data.status !== lastTelemetryStatusRef.current;
              const timeElapsed = now - lastTelemetryUpdateRef.current;

              // Throttle telemetry re-renders to ~4 Hz (250ms), or immediately on status changes
              if (statusChanged || timeElapsed >= 250) {
                lastTelemetryUpdateRef.current = now;
                lastTelemetryStatusRef.current = data.status;
                setTelemetry(data);
                if (data.status && data.status !== "STOPPED") {
                  setIsSystemRunning(true);
                } else if (data.status === "STOPPED") {
                  setIsSystemRunning(false);
                }
              }
              if (data.employee_id && data.employee_id !== selectedEmpId) {
                setSelectedEmpId(data.employee_id);
              }
            }
          } catch (e) {
            console.error("WS error parsing message", e);
          }
        };

        ws.onclose = () => {
          if (!isClosed) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (e) {
        if (!isClosed) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // 3. Refresh intervals periodically
  useEffect(() => {
    if (selectedWsId && selectedEmpId) {
      loadIntervals();
      const interval = setInterval(loadIntervals, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedWsId, selectedEmpId, telemetry.status]);

  const loadIntervals = async () => {
    if (!selectedWsId || !selectedEmpId) return;
    try {
      const data = await getWorkstationIntervals(selectedWsId, selectedEmpId);
      if (Array.isArray(data)) {
        setIntervals(data);
        setBackendConnected(true);
      }
    } catch (err: any) {
      if (err?.message?.includes("Unable to connect to backend server") || err?.name === "TypeError") {
        setBackendConnected(false);
      }
      // Silently catch background polling errors when backend is offline or restarting
    }
  };

  const handleStartSystem = async () => {
    setSystemActionLoading(true);
    try {
      setWsStreamKey(Date.now());
      await startWorkstationCamera();
      setIsSystemRunning(true);
      toast.success("Workstation System Started", {
        description: "Camera is scanning stored employee faces to track active working time for present workers.",
      });
      loadIntervals();
    } catch (err: any) {
      console.error("Start system error:", err);
      toast.error("Failed to start workstation system", { description: err.message });
    } finally {
      setSystemActionLoading(false);
    }
  };

  const handleStopSystem = async () => {
    setSystemActionLoading(true);
    try {
      await stopWorkstationCamera();
      setIsSystemRunning(false);
      toast.info("Workstation System Stopped", {
        description: "Camera released and presence monitoring stopped.",
      });
      loadIntervals();
    } catch (err: any) {
      console.error("Stop system error:", err);
      toast.error("Failed to stop workstation system", { description: err.message });
    } finally {
      setSystemActionLoading(false);
    }
  };

  const handleStartBreak = async () => {
    if (!selectedWsId) return;
    setBreakLoading(true);
    try {
      await startWorkstationBreak(selectedWsId, breakType, "supervisor", breakNotes);
      setBreakModalOpen(false);
      setBreakNotes("");
      toast.success("Break Started", { description: `${breakType} authorized. Alerts suspended.` });
    } catch (err: any) {
      toast.error("Error starting break", { description: err.message });
    } finally {
      setBreakLoading(false);
    }
  };

  const handleStopBreak = async () => {
    if (!selectedWsId) return;
    setBreakLoading(true);
    try {
      await stopWorkstationBreak(selectedWsId, "supervisor");
      toast.success("Break Ended", { description: "Workstation monitoring resumed." });
    } catch (err: any) {
      toast.error("Error ending break", { description: err.message });
    } finally {
      setBreakLoading(false);
    }
  };

  const handleThresholdChange = async (minutes: number) => {
    if (minutes < 1) return;
    setAbsenceThresholdMin(minutes);
    setShowCustomThreshold(false);
    try {
      if (selectedWsId) {
        await updateWorkstationThreshold(selectedWsId, minutes);
      }
      await updateAlertConfig(minutes);
      toast.success(`Absence alert threshold set to ${minutes} min`, {
        description: `Alerts trigger only when employee is absent for more than ${minutes} continuous minutes.`,
      });
      loadInitialData();
    } catch (err: any) {
      toast.error("Error updating threshold", { description: err.message });
    }
  };

  const handleResetTodayTime = async () => {
    if (!selectedWsId) return;
    try {
      const res = await resetWorkstationTodayTime(selectedWsId, selectedEmpId || undefined);
      toast.success("Workstation Time Reset", {
        description: res.message || "Removed old calculated intervals. Time reset to 00h 00m 00s.",
      });
      setTelemetry((prev: any) => ({
        ...prev,
        total_active_seconds: 0,
        total_active_formatted: "00h 00m 00s",
        live_interval_seconds: 0,
      }));
      loadIntervals();
    } catch (err: any) {
      toast.error("Failed to reset time", { description: err.message });
    }
  };

  const submitCorrection = async () => {
    if (!editingInterval || !selectedWsId) return;
    try {
      await correctWorkstationInterval(selectedWsId, {
        interval_id: editingInterval.id,
        duration_seconds: parseFloat(correctionDuration),
        notes: correctionNote || "Supervisor manual correction",
        operator: "supervisor",
      });
      setEditingInterval(null);
      loadIntervals();
      toast.success("Correction saved successfully");
    } catch (err: any) {
      toast.error("Correction failed", { description: err.message });
    }
  };

  const currentWs = workstations.find((w) => w.id === selectedWsId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111] flex items-center gap-2">
            <Monitor className="w-6 h-6 text-[#111111]" /> Workstation Presence & Time Tracker
          </h2>
          <p className="text-sm text-[#666666] mt-0.5">
            Precision active presence monitoring with configurable absence threshold and automated alerts
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {isSystemRunning ? (
            <Button
              onClick={handleStopSystem}
              disabled={systemActionLoading}
              className="bg-white border border-[#E5E7EB] hover:bg-neutral-100 text-[#111111] font-semibold flex items-center gap-2 shadow-xs text-xs"
            >
              <Square className="w-4 h-4 fill-neutral-800" /> Stop System
            </Button>
          ) : (
            <Button
              onClick={handleStartSystem}
              disabled={systemActionLoading}
              className="bg-[#111111] hover:bg-neutral-800 text-white font-semibold flex items-center gap-2 shadow-xs text-xs"
            >
              <Play className="w-4 h-4 fill-white" /> Start System
            </Button>
          )}

          {telemetry.is_on_break ? (
            <Button
              variant="outline"
              onClick={handleStopBreak}
              disabled={breakLoading || !isSystemRunning}
              className="border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 flex items-center gap-2 text-xs font-semibold"
            >
              <Coffee className="w-4 h-4 text-amber-600" /> End Break
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setBreakModalOpen(true)}
              disabled={breakLoading || !isSystemRunning || !telemetry.employee_id}
              className="border-[#E5E7EB] text-[#111111] bg-white hover:bg-neutral-100 flex items-center gap-2 text-xs font-semibold shadow-xs"
            >
              <Coffee className="w-4 h-4 text-[#666666]" /> Start Break
            </Button>
          )}
        </div>
      </div>

      {/* Backend Offline Notice Banner */}
      {!backendConnected && (
        <div className="p-3.5 rounded-lg bg-neutral-50 border border-[#E5E7EB] text-[#111111] flex items-center justify-between text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-neutral-800 flex-shrink-0" />
            <span>
              <strong>Backend Server Offline:</strong> Unable to connect to backend server at <code className="bg-neutral-200/60 px-1.5 py-0.5 rounded font-mono text-[11px] text-[#111111]">http://127.0.0.1:8000</code>. Please start the backend server.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={loadInitialData}
            className="text-xs bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 font-semibold shadow-xs"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* Workstation & Auto-Detected Worker Status Bar */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Card 1: Selected Workstation */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
          <Label className="text-xs text-[#666666] font-semibold uppercase tracking-wider">Selected Workstation</Label>
          <select
            value={selectedWsId || ""}
            onChange={(e) => setSelectedWsId(Number(e.target.value))}
            className="w-full mt-1.5 bg-neutral-50 border border-[#E5E7EB] rounded-md px-3 py-1.5 text-[#111111] text-xs font-medium focus:outline-none focus:border-[#111111] focus:bg-white"
          >
            {workstations.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>
        </Card>

        {/* Card 2: Detected Worker */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
          <div className="flex justify-between items-center">
            <Label className="text-xs text-[#666666] font-semibold uppercase tracking-wider">Detected Worker</Label>
            <span className="text-xs text-[#111111] font-semibold bg-neutral-100 px-2 py-0.5 rounded">Auto Face</span>
          </div>
          <div className="mt-1.5">
            <div className="text-sm font-bold text-[#111111] truncate">
              {telemetry.employee_name || (telemetry.status === "ACTIVE" ? telemetry.employee_id : (telemetry.detected_worker_name || "Scanning camera..."))}
            </div>
            <div className="text-xs text-[#666666] font-mono mt-0.5">
              ID: {telemetry.employee_id || "Waiting for worker"}
            </div>
          </div>
        </Card>

        {/* Card 3: Attendance & Shift */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
          <div className="flex justify-between items-center">
            <Label className="text-xs text-[#666666] font-semibold uppercase tracking-wider">Attendance & Shift</Label>
            <span className="text-xs text-[#666666] font-mono font-medium">
              {telemetry.shift || "General Shift"} ({telemetry.shift_timing || "09:00 - 18:00"})
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            {telemetry.attendance_status === "PRESENT" || (telemetry.status === "ACTIVE" && telemetry.employee_id) ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> PRESENT (Verified)
              </span>
            ) : telemetry.attendance_status === "OUTSIDE_SHIFT" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> OUTSIDE SHIFT
              </span>
            ) : telemetry.attendance_status === "NOT_MARKED" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> NOT MARKED / ABSENT
              </span>
            ) : telemetry.attendance_status === "UNKNOWN" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                <User className="w-3.5 h-3.5" /> Unknown Face
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-[#111111] border border-neutral-200">
                <Video className="w-3.5 h-3.5" /> Camera Scanning
              </span>
            )}
          </div>
        </Card>

        {/* Card 4: Configurable Absence Threshold (No 30s/60s/120s) */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <Label className="text-xs text-[#666666] font-semibold uppercase tracking-wider">Absence Threshold</Label>
            <span className="text-xs font-mono font-bold text-[#111111] bg-neutral-100 px-2 py-0.5 rounded">
              {absenceThresholdMin} min
            </span>
          </div>
          <div className="mt-2">
            {!showCustomThreshold ? (
              <div className="flex flex-wrap gap-1">
                {[5, 10, 15, 20, 30].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleThresholdChange(m)}
                    className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                      absenceThresholdMin === m
                        ? "bg-[#111111] text-white"
                        : "bg-white border border-[#E5E7EB] text-[#111111] hover:bg-neutral-100"
                    }`}
                  >
                    {m}m{m === 15 ? " (Def)" : ""}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowCustomThreshold(true)}
                  className="text-xs px-2 py-1 rounded font-medium bg-white border border-[#E5E7EB] text-[#666666] hover:bg-neutral-100"
                >
                  Custom
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = parseInt(customThresholdInput, 10);
                  if (val && val > 0) handleThresholdChange(val);
                }}
                className="flex items-center gap-1.5"
              >
                <Input
                  type="number"
                  min="1"
                  placeholder="Min"
                  value={customThresholdInput}
                  onChange={(e) => setCustomThresholdInput(e.target.value)}
                  className="h-7 text-xs bg-white border-[#E5E7EB] text-[#111111] w-20"
                />
                <Button type="submit" size="sm" className="h-7 px-2 text-xs bg-[#111111] hover:bg-neutral-800 text-white">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustomThreshold(false)}
                  className="h-7 px-2 text-xs text-[#666666]"
                >
                  Cancel
                </Button>
              </form>
            )}
          </div>
        </Card>
      </div>

      {/* Active Position Alert Banner */}
      {telemetry.has_active_alert && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between shadow-xs animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div>
              <span className="font-bold text-rose-800 text-sm">
                POSITION ABSENCE ALERT ACTIVE
              </span>
              <p className="text-xs text-rose-700 mt-0.5">
                Employee <strong>{telemetry.employee_name || telemetry.employee_id}</strong> has been absent from assigned position for{" "}
                <span className="font-mono font-bold text-rose-950">{telemetry.absence_duration_formatted || `${absenceThresholdMin}m+`}</span> (Threshold: {telemetry.alert_threshold_formatted || `${absenceThresholdMin}m 00s`}).
              </p>
            </div>
          </div>
          <a
            href="/dashboard/alerts"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#111111] hover:bg-neutral-800 text-white shadow-xs transition-colors"
          >
            Review Alert &rarr;
          </a>
        </div>
      )}

      {/* Approved Break Banner */}
      {telemetry.is_on_break && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <Coffee className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-bold text-amber-900 text-sm">
                EMPLOYEE ON APPROVED BREAK ({telemetry.break_type || "Break"})
              </span>
              <p className="text-xs text-amber-700 mt-0.5">
                Position monitoring & absence alerts are currently suspended. Working timer is paused.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStopBreak}
            disabled={breakLoading}
            className="border-amber-300 text-amber-800 bg-white hover:bg-amber-100 text-xs font-semibold"
          >
            End Break & Resume
          </Button>
        </div>
      )}

      {/* Main Grid: Stream + Timer Panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Camera Feed with ROI Overlay */}
        <Card className="lg:col-span-2 bg-white border-[#E5E7EB] shadow-xs overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b border-[#E5E7EB] flex flex-row items-center justify-between bg-white">
            <CardTitle className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <Video className="w-4 h-4 text-[#111111]" /> Workstation Camera Feed
            </CardTitle>
            <div className="flex items-center gap-2">
              {telemetry.is_camera_connected ? (
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Connected
                </span>
              ) : (
                <span className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Camera Error
                </span>
              )}
            </div>
          </CardHeader>
          <div className="flex-1 bg-neutral-950 flex items-center justify-center relative min-h-[420px]">
            {isSystemRunning ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_URL}/api/camera/workstation/stream?t=${wsStreamKey}`}
                alt="Workstation Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23111"><rect width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23555">Workstation Camera Active / Initializing...</text></svg>';
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                  <Video className="w-8 h-8 text-neutral-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Workstation System Inactive</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mt-1">
                    Click the <strong>Start System</strong> button to activate camera detection and begin calculating working time for present employees.
                  </p>
                </div>
                <Button
                  onClick={handleStartSystem}
                  disabled={systemActionLoading}
                  className="bg-[#111111] hover:bg-neutral-800 text-white font-semibold px-6 py-2 flex items-center gap-2 shadow-sm text-xs border border-neutral-700"
                >
                  <Play className="w-4 h-4 fill-white" /> Start System
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Right: State & Precision Timer Display */}
        <div className="space-y-4 flex flex-col">
          {/* Status Badge Card */}
          <Card className="bg-white border-[#E5E7EB] shadow-xs p-6 flex flex-col items-center justify-center text-center">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold mb-2">
              Current Session Status
            </span>

            {!isSystemRunning ? (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-neutral-100 text-[#111111] border border-[#E5E7EB]">
                  <Square className="w-3.5 h-3.5 text-neutral-600" />
                  SYSTEM STOPPED
                </div>
                <span className="text-xs text-[#666666] mt-2">Click &apos;Start System&apos; to begin monitoring</span>
              </div>
            ) : telemetry.is_on_break ? (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  <Coffee className="w-4 h-4 text-amber-600" />
                  ON BREAK ({telemetry.break_type || "Break"})
                </div>
                <span className="text-xs text-[#666666] mt-2">Absence alerts suspended</span>
              </div>
            ) : telemetry.status === "ACTIVE" ? (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  ACTIVE PRESENCE
                </div>
                <span className="text-xs text-[#666666] mt-2">Employee confirmed in workstation area</span>
              </div>
            ) : telemetry.status === "PENDING_ABSENCE" ? (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                  <Clock className="w-4 h-4 text-amber-600" />
                  PENDING ABSENCE ({telemetry.grace_remaining_seconds}s)
                </div>
                <span className="text-xs text-amber-700 mt-2 font-medium">
                  Absence grace active. Timer pauses in {telemetry.grace_remaining_seconds}s if not returned.
                </span>
              </div>
            ) : telemetry.status === "PAUSED" ? (
              <div className="flex flex-col items-center gap-1">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                  telemetry.has_active_alert
                    ? "bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
                    : "bg-orange-50 text-orange-700 border border-orange-200"
                }`}>
                  <PauseCircle className="w-4 h-4 text-orange-600" />
                  PAUSED {telemetry.has_active_alert ? "(ALERT ACTIVE)" : ""}
                </div>
                <span className="text-xs text-[#666666] mt-2">
                  Absent: <strong className="text-[#111111] font-mono">{telemetry.absence_duration_formatted || "00m 00s"}</strong>
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-neutral-100 text-[#111111] border border-neutral-200">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neutral-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neutral-600"></span>
                  </span>
                  SCANNING FOR WORKER
                </div>
                <span className="text-xs text-[#666666] mt-2">Checking stored employee faces in DB</span>
              </div>
            )}
          </Card>

          {/* Big Live Active Time Timer */}
          <Card className="bg-white border-[#E5E7EB] shadow-xs p-6 flex flex-col items-center justify-center text-center flex-1">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold flex items-center gap-1 mb-1">
              <Timer className="w-4 h-4 text-[#111111]" /> Total Active Workstation Time
            </span>
            <div className="text-4xl font-mono font-extrabold tracking-tight text-[#111111] my-3">
              {telemetry.total_active_formatted}
            </div>
            <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t border-[#E5E7EB] text-xs">
              <div className="text-left">
                <span className="text-[#666666] block">Current Interval</span>
                <span className="text-[#111111] font-mono font-semibold">
                  {telemetry.live_interval_seconds}s
                </span>
              </div>
              <div className="text-right">
                <span className="text-[#666666] block">Last Confirmed</span>
                <span className="text-[#111111] font-mono font-semibold">
                  {telemetry.last_confirmed_presence}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between w-full pt-3 mt-3 border-t border-[#E5E7EB]">
              <div className="text-left text-xs">
                <span className="text-[#666666] block text-[11px]">Shift Measurement</span>
                <span className="text-[#111111] font-mono font-semibold text-xs">
                  {telemetry.shift_timing || "09:00 - 18:00"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetTodayTime}
                className="h-7 text-xs border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold flex items-center gap-1 shadow-xs bg-white"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Reset Today
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Discrete Presence Intervals Table */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-[#E5E7EB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white">
          <div>
            <CardTitle className="text-base font-bold text-[#111111]">Daily Presence Intervals</CardTitle>
            <CardDescription className="text-xs text-[#666666]">
              Persisted non-overlapping active time intervals for {selectedEmpId || "monitored employee"} today
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-[#666666]">
              <span className="font-medium">View Employee:</span>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="bg-neutral-50 border border-[#E5E7EB] rounded-md px-2.5 py-1 text-[#111111] text-xs font-medium focus:outline-none focus:border-[#111111] focus:bg-white"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.employee_id}>
                    {emp.employee_id} - {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={loadIntervals} className="bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 h-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Interval ID</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Start Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">End Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Active Duration</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Reliability / Status</TableHead>
                <TableHead className="text-right font-semibold text-[#111111] text-xs py-3 pr-4">Correction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {intervals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#666666] text-sm">
                    No presence intervals recorded today for this workstation.
                  </TableCell>
                </TableRow>
              ) : (
                intervals.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-neutral-50 transition-colors">
                    <TableCell className="text-[#666666] font-mono text-xs">#{inv.id}</TableCell>
                    <TableCell className="text-[#111111] font-mono text-xs">
                      {format(new Date(inv.start_time), "HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-[#111111] font-mono text-xs">
                      {inv.end_time ? format(new Date(inv.end_time), "HH:mm:ss") : (
                        <span className="text-emerald-600 animate-pulse font-semibold">In Progress...</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[#111111] font-semibold font-mono text-xs">
                      {inv.duration_seconds.toFixed(1)}s ({Math.floor(inv.duration_seconds / 60)}m {Math.floor(inv.duration_seconds % 60)}s)
                    </TableCell>
                    <TableCell>
                      {inv.is_uncertain ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> {inv.uncertain_reason || "Uncertain"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#666666] hover:text-[#111111] h-7 text-xs"
                        onClick={() => {
                          setEditingInterval(inv);
                          setCorrectionDuration(inv.duration_seconds.toString());
                          setCorrectionNote("");
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" /> Adjust
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual Interval Correction Modal */}
      {editingInterval && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-[#E5E7EB] shadow-xl max-w-md w-full">
            <CardHeader className="border-b border-[#E5E7EB]">
              <CardTitle className="text-[#111111] flex items-center gap-2 text-base font-bold">
                <Edit2 className="w-4 h-4 text-[#111111]" /> Adjust Presence Interval #{editingInterval.id}
              </CardTitle>
              <CardDescription className="text-xs text-[#666666]">
                Authorized manual time adjustment. All corrections are logged to the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="text-xs text-[#111111] font-semibold">New Duration (Seconds)</Label>
                <Input
                  type="number"
                  step="1"
                  value={correctionDuration}
                  onChange={(e) => setCorrectionDuration(e.target.value)}
                  className="bg-neutral-50 border-[#E5E7EB] text-[#111111] mt-1 focus:bg-white focus:border-[#111111] text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-[#111111] font-semibold">Reason / Audit Notes</Label>
                <Input
                  placeholder="e.g. Employee attended team standup"
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  className="bg-neutral-50 border-[#E5E7EB] text-[#111111] mt-1 focus:bg-white focus:border-[#111111] text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <Button variant="outline" size="sm" onClick={() => setEditingInterval(null)} className="text-xs border-[#E5E7EB] text-[#111111]">
                  Cancel
                </Button>
                <Button size="sm" onClick={submitCorrection} className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold">
                  Save Correction
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Start Break Modal */}
      {breakModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-[#E5E7EB] shadow-xl max-w-md w-full">
            <CardHeader className="border-b border-[#E5E7EB]">
              <CardTitle className="text-[#111111] flex items-center gap-2 text-base font-bold">
                <Coffee className="w-5 h-5 text-amber-600" /> Authorize Employee Break
              </CardTitle>
              <CardDescription className="text-xs text-[#666666]">
                Suspending position monitoring will prevent automatic absence alerts while employee is on break.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="text-xs text-[#111111] font-semibold">Break Type</Label>
                <select
                  value={breakType}
                  onChange={(e) => setBreakType(e.target.value)}
                  className="w-full mt-1.5 bg-neutral-50 border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111111] text-xs font-medium focus:outline-none focus:border-[#111111] focus:bg-white"
                >
                  <option value="Lunch Break">Lunch Break</option>
                  <option value="Tea/Coffee Break">Tea / Coffee Break</option>
                  <option value="Rest Break">Rest Break</option>
                  <option value="Authorized Leave">Authorized Temporary Leave</option>
                  <option value="Official Duty">Official External Duty</option>
                </select>
              </div>

              <div>
                <Label className="text-xs text-[#111111] font-semibold">Supervisor Notes (Optional)</Label>
                <Input
                  placeholder="e.g. Approved 30-minute lunch break"
                  value={breakNotes}
                  onChange={(e) => setBreakNotes(e.target.value)}
                  className="bg-neutral-50 border-[#E5E7EB] text-[#111111] mt-1.5 text-xs focus:bg-white focus:border-[#111111]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBreakModalOpen(false)}
                  disabled={breakLoading}
                  className="text-xs border-[#E5E7EB] text-[#111111]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleStartBreak}
                  disabled={breakLoading}
                  className="bg-[#111111] hover:bg-neutral-800 text-white flex items-center gap-2 text-xs font-semibold shadow-xs"
                >
                  <Coffee className="w-4 h-4" /> Start Break
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
