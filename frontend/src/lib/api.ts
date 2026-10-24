export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}/api${endpoint}`;
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

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// =============================================================================
// Attendance APIs
// =============================================================================
export const getDashboardStats = () => fetchAPI("/analytics/overview");
export const getAttendance = (date?: string, employee_id?: string) => {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  if (employee_id) params.append("employee_id", employee_id);
  return fetchAPI(`/attendance?${params.toString()}`);
};
export const manualAttendanceCheckIn = (employeeId: string, operator: string = "supervisor", notes?: string) => {
  return fetchAPI("/attendance/manual", {
    method: "POST",
    body: JSON.stringify({
      employee_id: employeeId,
      operator,
      notes: notes || "Manual attendance check-in",
    }),
  });
};
export const getDailyAnalytics = () => fetchAPI("/analytics/daily");

// =============================================================================
// Workstation Presence APIs
// =============================================================================
export const getWorkstations = () => fetchAPI("/workstations");
export const getWorkstation = (id: number) => fetchAPI(`/workstations/${id}`);
export const updateWorkstation = (id: number, data: any) =>
  fetchAPI(`/workstations/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const getWorkstationTelemetry = (id: number) => fetchAPI(`/workstations/${id}/status`);

export const startWorkstationSession = (id: number, employeeId: string, operator: string = "supervisor") =>
  fetchAPI(`/workstations/${id}/start`, {
    method: "POST",
    body: JSON.stringify({ employee_id: employeeId, operator }),
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

// =============================================================================
// Employees APIs
// =============================================================================
export const getEmployees = () => fetchAPI("/employees");
export const getEmployee = (id: string) => fetchAPI(`/employees/${id}`);
export const getEnrollmentReport = () => fetchAPI("/employees/enrollment-report");
export const syncEmployees = () => fetchAPI("/employees/sync", { method: "POST" });

export const createEmployee = async (formData: FormData) => {
  const url = `${API_URL}/api/employees`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error: ${response.status} ${errorBody}`);
  }
  return response.json();
};

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
// Settings APIs
// =============================================================================
export const getSettings = () => fetchAPI("/settings");
export const updateSettings = (data: any) => fetchAPI("/settings", { method: "PUT", body: JSON.stringify(data) });
