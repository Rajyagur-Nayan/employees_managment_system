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
} from "@/lib/api";

export default function WorkstationsPage() {
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [intervals, setIntervals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingInterval, setEditingInterval] = useState<any | null>(null);
  const [correctionDuration, setCorrectionDuration] = useState<string>("");
  const [correctionNote, setCorrectionNote] = useState<string>("");

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

  // 1. Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [wsList, empList] = await Promise.all([
        getWorkstations(),
        getEmployees(),
      ]);
      setWorkstations(wsList);
      setEmployees(empList);
      if (wsList.length > 0) {
        setSelectedWsId(wsList[0].id);
      }
      if (empList.length > 0) {
        setSelectedEmpId(empList[0].employee_id);
      }
    } catch (err) {
      console.error("Failed to load initial data", err);
    }
  };

  // 2. Setup WebSocket connection for live telemetry
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL?.replace("/ws/attendance", "/ws/workstation") || "ws://localhost:8000/ws/workstation";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "telemetry") {
          setTelemetry(data);
          if (data.employee_id && data.employee_id !== selectedEmpId) {
            setSelectedEmpId(data.employee_id);
          }
        }
      } catch (e) {
        console.error("WS error parsing message", e);
      }
    };

    return () => {
      ws.close();
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
      setIntervals(data);
    } catch (err) {
      console.error("Error loading intervals", err);
    }
  };

  const handleStart = async () => {
    if (!selectedWsId || !selectedEmpId) return;
    setLoading(true);
    try {
      await startWorkstationSession(selectedWsId, selectedEmpId, "supervisor");
      await loadIntervals();
    } catch (err: any) {
      alert(`Error starting session: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!selectedWsId) return;
    setLoading(true);
    try {
      await stopWorkstationSession(selectedWsId, "supervisor");
      await loadIntervals();
    } catch (err: any) {
      alert(`Error stopping session: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGraceChange = async (newGrace: number) => {
    if (!selectedWsId) return;
    try {
      await updateWorkstation(selectedWsId, { absence_grace_seconds: newGrace });
      loadInitialData();
    } catch (err: any) {
      alert(`Error updating grace period: ${err.message}`);
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
    } catch (err: any) {
      alert(`Correction failed: ${err.message}`);
    }
  };

  const currentWs = workstations.find((w) => w.id === selectedWsId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-blue-500" /> Workstation Presence & Time Tracker
          </h2>
          <p className="text-neutral-400">
            Precision active presence monitoring with automatic absence grace period
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {telemetry.is_monitoring ? (
            <Button
              variant="destructive"
              onClick={handleStop}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Square className="w-4 h-4 fill-current" /> Stop Monitoring
            </Button>
          ) : (
            <Button
              variant="default"
              onClick={handleStart}
              disabled={loading || !selectedEmpId}
              className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" /> Start Monitoring
            </Button>
          )}
        </div>
      </div>

      {/* Workstation & Employee Config Bar */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <Label className="text-xs text-neutral-400">Selected Workstation</Label>
          <select
            value={selectedWsId || ""}
            onChange={(e) => setSelectedWsId(Number(e.target.value))}
            className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {workstations.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <Label className="text-xs text-neutral-400">Assigned Employee</Label>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            disabled={telemetry.is_monitoring}
            className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.employee_id}>
                {emp.employee_id} - {emp.name}
              </option>
            ))}
          </select>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800 p-4">
          <div className="flex justify-between items-center">
            <Label className="text-xs text-neutral-400">Absence Grace Period</Label>
            <span className="text-xs text-neutral-500">{currentWs?.absence_grace_seconds || 60}s default</span>
          </div>
          <div className="flex gap-2 mt-1">
            {[30, 60, 120].map((sec) => (
              <Button
                key={sec}
                size="sm"
                variant={currentWs?.absence_grace_seconds === sec ? "secondary" : "outline"}
                className="flex-1 text-xs"
                onClick={() => handleGraceChange(sec)}
              >
                {sec}s
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Main Grid: Stream + Timer Panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Camera Feed with ROI Overlay */}
        <Card className="lg:col-span-2 bg-neutral-900 border-neutral-800 overflow-hidden flex flex-col">
          <CardHeader className="py-3 px-4 border-b border-neutral-800 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Video className="w-4 h-4 text-neutral-400" /> Workstation Camera Feed
            </CardTitle>
            <div className="flex items-center gap-2">
              {telemetry.is_camera_connected ? (
                <span className="text-xs text-emerald-500 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Connected
                </span>
              ) : (
                <span className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Camera Error
                </span>
              )}
            </div>
          </CardHeader>
          <div className="flex-1 bg-black flex items-center justify-center relative min-h-[420px]">
            {telemetry.is_monitoring ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_URL}/api/camera/workstation/stream`}
                alt="Workstation Feed"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23111"><rect width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23555">Workstation Camera Offline</text></svg>';
                }}
              />
            ) : (
              <div className="text-neutral-600 flex flex-col items-center gap-2 p-8 text-center">
                <Monitor className="w-12 h-12 opacity-20" />
                <p className="text-sm">Workstation monitoring is currently stopped.</p>
                <p className="text-xs text-neutral-700">Click &quot;Start Monitoring&quot; above to begin active presence tracking.</p>
              </div>
            )}
          </div>
        </Card>

        {/* Right: State & Precision Timer Display */}
        <div className="space-y-4 flex flex-col">
          {/* Status Badge Card */}
          <Card className="bg-neutral-900 border-neutral-800 p-6 flex flex-col items-center justify-center text-center">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
              Current Session Status
            </span>
            {telemetry.status === "ACTIVE" && (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  ACTIVE PRESENCE
                </div>
                <span className="text-xs text-neutral-400 mt-2">Employee confirmed in workstation area</span>
              </div>
            )}

            {telemetry.status === "PENDING_ABSENCE" && (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                  <Clock className="w-4 h-4 text-amber-400" />
                  PENDING ABSENCE ({telemetry.grace_remaining_seconds}s)
                </div>
                <span className="text-xs text-amber-300/80 mt-2">
                  Absence grace active. Timer pauses in {telemetry.grace_remaining_seconds}s if not returned.
                </span>
              </div>
            )}

            {telemetry.status === "PAUSED" && (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <PauseCircle className="w-4 h-4 text-orange-400" />
                  PAUSED
                </div>
                <span className="text-xs text-neutral-400 mt-2">Employee away beyond grace period</span>
              </div>
            )}

            {telemetry.status === "STOPPED" && (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
                  STOPPED
                </div>
                <span className="text-xs text-neutral-500 mt-2">Monitoring session inactive</span>
              </div>
            )}
          </Card>

          {/* Big Live Active Time Timer */}
          <Card className="bg-neutral-900 border-neutral-800 p-6 flex flex-col items-center justify-center text-center flex-1">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-1 mb-1">
              <Timer className="w-4 h-4 text-blue-400" /> Total Active Workstation Time
            </span>
            <div className="text-4xl font-mono font-bold tracking-tight text-white my-3">
              {telemetry.total_active_formatted}
            </div>
            <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t border-neutral-800 text-xs">
              <div className="text-left">
                <span className="text-neutral-500 block">Current Interval</span>
                <span className="text-white font-mono font-medium">
                  {telemetry.live_interval_seconds}s
                </span>
              </div>
              <div className="text-right">
                <span className="text-neutral-500 block">Last Confirmed</span>
                <span className="text-white font-mono font-medium">
                  {telemetry.last_confirmed_presence}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Discrete Presence Intervals Table */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="py-4 px-6 border-b border-neutral-800 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base text-white">Daily Presence Intervals</CardTitle>
            <CardDescription className="text-xs text-neutral-400">
              Persisted non-overlapping active time intervals for {selectedEmpId} on {format(new Date(), "yyyy-MM-dd")}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadIntervals} className="text-neutral-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-neutral-800/50">
                <TableHead className="text-neutral-400">Interval ID</TableHead>
                <TableHead className="text-neutral-400">Start Time</TableHead>
                <TableHead className="text-neutral-400">End Time</TableHead>
                <TableHead className="text-neutral-400">Active Duration</TableHead>
                <TableHead className="text-neutral-400">Reliability / Status</TableHead>
                <TableHead className="text-right text-neutral-400">Correction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intervals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-neutral-500">
                    No presence intervals recorded today for this workstation.
                  </TableCell>
                </TableRow>
              ) : (
                intervals.map((inv) => (
                  <TableRow key={inv.id} className="border-neutral-800 hover:bg-neutral-800/50">
                    <TableCell className="text-neutral-400 font-mono">#{inv.id}</TableCell>
                    <TableCell className="text-white font-mono">
                      {format(new Date(inv.start_time), "HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-white font-mono">
                      {inv.end_time ? format(new Date(inv.end_time), "HH:mm:ss") : (
                        <span className="text-emerald-400 animate-pulse font-medium">In Progress...</span>
                      )}
                    </TableCell>
                    <TableCell className="text-white font-semibold font-mono">
                      {inv.duration_seconds.toFixed(1)}s ({Math.floor(inv.duration_seconds / 60)}m {Math.floor(inv.duration_seconds % 60)}s)
                    </TableCell>
                    <TableCell>
                      {inv.is_uncertain ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" /> {inv.uncertain_reason || "Uncertain"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-neutral-400 hover:text-white"
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <Card className="bg-neutral-900 border-neutral-800 max-w-md w-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" /> Adjust Presence Interval #{editingInterval.id}
              </CardTitle>
              <CardDescription className="text-neutral-400">
                Authorized manual time adjustment. All corrections are logged to the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-neutral-300">New Duration (Seconds)</Label>
                <Input
                  type="number"
                  step="1"
                  value={correctionDuration}
                  onChange={(e) => setCorrectionDuration(e.target.value)}
                  className="bg-neutral-950 border-neutral-800 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-neutral-300">Reason / Audit Notes</Label>
                <Input
                  placeholder="e.g. Employee attended team standup"
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  className="bg-neutral-950 border-neutral-800 text-white mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditingInterval(null)}>
                  Cancel
                </Button>
                <Button onClick={submitCorrection} className="bg-blue-600 hover:bg-blue-500 text-white">
                  Save Correction
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
