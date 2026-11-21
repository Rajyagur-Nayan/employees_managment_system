const resolveApiUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  return envUrl.replace("://localhost:", "://127.0.0.1:");
};

export const API_URL = resolveApiUrl();

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}/api${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API Error: ${response.status} ${errorBody}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (err: any) {
    if (err.name === "TypeError" && err.message?.includes("fetch")) {
      throw new Error(`Unable to connect to backend server at ${API_URL}. Ensure the backend server is running.`);
    }
    throw err;
  }
}

// =============================================================================
// Attendance APIs
// =============================================================================
export const getAttendance = (date?: string, employee_id?: string) => {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  if (employee_id) params.append("employee_id", employee_id);
  return fetchAPI(`/attendance?${params.toString()}`);
};

export const manualAttendanceCheckIn = (
  employeeId: string,
  operator: string = "supervisor",
  notes?: string,
  date?: string
) => {
  return fetchAPI("/attendance/manual", {
    method: "POST",
    body: JSON.stringify({
      employee_id: employeeId,
      operator,
      notes: notes || "Manual attendance check-in",
      date: date || undefined,
    }),
  });
};

// =============================================================================
// Workstation Presence APIs
// =============================================================================
export const getWorkstations = () => fetchAPI("/workstations");
export const getWorkstation = (id: number) => fetchAPI(`/workstations/${id}`);
export const updateWorkstation = (id: number, data: any) =>
  fetchAPI(`/workstations/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const updateWorkstationThreshold = (id: number, minutes: number) =>
  fetchAPI(`/workstations/${id}/threshold?minutes=${minutes}`, { method: "PUT" });

export const getWorkstationTelemetry = (id: number) => fetchAPI(`/workstations/${id}/status`);

export const startWorkstationSession = (
  id: number,
  employeeId: string,
  operator: string = "supervisor",
  shiftName: string = "General Shift",
  validateAttendance: boolean = true
) =>
  fetchAPI(`/workstations/${id}/start`, {
    method: "POST",
    body: JSON.stringify({
      employee_id: employeeId,
      operator,
      shift_name: shiftName,
      validate_attendance: validateAttendance,
    }),
  });

export const stopWorkstationSession = (id: number, operator: string = "supervisor") =>
  fetchAPI(`/workstations/${id}/stop?operator=${encodeURIComponent(operator)}`, { method: "POST" });

export const getWorkstationIntervals = (id: number, employeeId: string, date?: string) => {
  const params = new URLSearchParams({ employee_id: employeeId });
  if (date) params.append("date", date);
  return fetchAPI(`/workstations/${id}/intervals?${params.toString()}`);
};

export const correctWorkstationInterval = (id: number, data: { interval_id: number; duration_seconds: number; notes: string; operator?: string }) =>
  fetchAPI(`/workstations/${id}/correction`, { method: "POST", body: JSON.stringify(data) });

export const resetWorkstationTodayTime = (id: number, employeeId?: string, date?: string) => {
  const params = new URLSearchParams();
  if (employeeId) params.append("employee_id", employeeId);
  if (date) params.append("date", date);
  const qStr = params.toString();
  return fetchAPI(`/workstations/${id}/reset-today${qStr ? `?${qStr}` : ""}`, {
    method: "POST",
  });
};

export const getLiveTracking = (params?: {
  date?: string;
  shift?: string;
  workstation_id?: number;
  employee_id?: string;
  status?: string;
}) => {
  const query = new URLSearchParams();
  if (params?.date) query.append("date", params.date);
  if (params?.shift) query.append("shift", params.shift);
  if (params?.workstation_id) query.append("workstation_id", params.workstation_id.toString());
  if (params?.employee_id) query.append("employee_id", params.employee_id);
  if (params?.status) query.append("status", params.status);
  const qStr = query.toString();
  return fetchAPI(`/workstations/tracking/live${qStr ? `?${qStr}` : ""}`);
};

export const getDailyReport = (params?: {
  date?: string;
  shift?: string;
  workstation_id?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.date) query.append("date", params.date);
  if (params?.shift) query.append("shift", params.shift);
  if (params?.workstation_id) query.append("workstation_id", params.workstation_id.toString());
  const qStr = query.toString();
  return fetchAPI(`/workstations/reports/daily${qStr ? `?${qStr}` : ""}`);
};

// =============================================================================
// Employees APIs
// =============================================================================
export const getEmployees = () => fetchAPI("/employees");
export const getNextEmployeeId = () => fetchAPI("/employees/next-id");
export const getEmployee = (id: string) => fetchAPI(`/employees/${id}`);
export const getShifts = () => fetchAPI("/employees/shifts");
export const getEnrollmentReport = () => fetchAPI("/employees/enrollment-report");
export const syncEmployees = () => fetchAPI("/employees/sync", { method: "POST" });

export const createEmployee = async (formData: FormData) => {
  const url = `${API_URL}/api/employees`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let errorMsg = `API Error: ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        if (typeof errorJson.detail === "string") {
          errorMsg = errorJson.detail;
        } else if (Array.isArray(errorJson.detail)) {
          errorMsg = errorJson.detail.map((d: any) => `${d.loc?.slice(-1)[0] || "field"}: ${d.msg}`).join(", ");
        }
      }
    } catch {
      const errorText = await response.text().catch(() => "");
      if (errorText) errorMsg = errorText;
    }
    throw new Error(errorMsg);
  }
  return response.json();
};

export const updateEmployee = (id: string | number, data: any) =>
  fetchAPI(`/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteEmployee = (id: string) => fetchAPI(`/employees/${id}`, { method: "DELETE" });

// =============================================================================
// Camera APIs
// =============================================================================
export const startCamera = () => fetchAPI("/camera/start", { method: "POST" });
export const stopCamera = () => fetchAPI("/camera/stop", { method: "POST" });
export const getCameraStatus = () => fetchAPI("/camera/status");

export const startWorkstationCamera = () => fetchAPI("/camera/workstation/start", { method: "POST" });
export const stopWorkstationCamera = () => fetchAPI("/camera/workstation/stop", { method: "POST" });
export const getWorkstationCameraStatus = () => fetchAPI("/camera/workstation/status");

// =============================================================================
// Position Alerts & Absence Threshold APIs
// =============================================================================
export const getAlerts = (params?: {
  employee_id?: string;
  workstation_id?: number;
  status?: string;
  date?: string;
  shift?: string;
  limit?: number;
  offset?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.employee_id) query.append("employee_id", params.employee_id);
  if (params?.workstation_id) query.append("workstation_id", params.workstation_id.toString());
  if (params?.status) query.append("status", params.status);
  if (params?.date) query.append("date", params.date);
  if (params?.shift) query.append("shift", params.shift);
  if (params?.limit) query.append("limit", params.limit.toString());
  if (params?.offset) query.append("offset", params.offset.toString());
  return fetchAPI(`/alerts?${query.toString()}`);
};

export const getActiveAlertsCount = () => fetchAPI("/alerts/active");

export const getAlertConfig = () => fetchAPI("/alerts/config");
export const updateAlertConfig = (thresholdMinutes: number) =>
  fetchAPI("/alerts/config", {
    method: "PUT",
    body: JSON.stringify({ threshold_minutes: thresholdMinutes }),
  });

export const acknowledgeAlert = (alertId: number, acknowledgedBy: string = "manager", notes?: string) =>
  fetchAPI(`/alerts/${alertId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ acknowledged_by: acknowledgedBy, notes }),
  });

export const resolveAlert = (alertId: number, resolvedBy: string = "manager", notes?: string) =>
  fetchAPI(`/alerts/${alertId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolved_by: resolvedBy, notes }),
  });

export const startWorkstationBreak = (
  workstationId: number,
  breakType: string = "Lunch Break",
  approvedBy: string = "supervisor",
  notes?: string
) =>
  fetchAPI(`/workstations/${workstationId}/break/start`, {
    method: "POST",
    body: JSON.stringify({ break_type: breakType, approved_by: approvedBy, notes }),
  });

export const stopWorkstationBreak = (workstationId: number, operator: string = "supervisor") =>
  fetchAPI(`/workstations/${workstationId}/break/stop?operator=${encodeURIComponent(operator)}`, {
    method: "POST",
  });
