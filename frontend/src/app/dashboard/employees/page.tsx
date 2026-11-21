"use client";

import { useEffect, useState } from "react";
import { getEmployees, deleteEmployee, updateEmployee, getWorkstations, getShifts } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Trash2, Eye, Edit2, X, Check, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    employee_id: "",
    email: "",
    phone: "",
    department: "General",
    shift_name: "General Shift",
    shift_start: "09:00",
    shift_end: "18:00",
    assigned_workstation_id: "" as string | number,
    is_active: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadEmployees();
    getWorkstations().then(setWorkstations).catch(() => {});
    getShifts().then(setShifts).catch(() => {});
  }, []);

  const loadEmployees = () => {
    getEmployees()
      .then((data) => setEmployees(data || []))
      .catch((err) => {
        console.warn("Employees load notice:", err.message);
      });
  };

  const handleOpenEdit = (emp: any) => {
    setEditingEmp(emp);
    let start = "09:00";
    let end = "18:00";
    if (emp.shift_timing && emp.shift_timing.includes("-")) {
      const parts = emp.shift_timing.split("-");
      start = parts[0].trim();
      end = parts[1].trim();
    }
    setEditForm({
      name: emp.name || "",
      employee_id: emp.employee_id || "",
      email: emp.email || "",
      phone: emp.phone || "",
      department: emp.department || "General",
      shift_name: emp.shift_name || "General Shift",
      shift_start: start,
      shift_end: end,
      assigned_workstation_id: emp.assigned_workstation_id ? String(emp.assigned_workstation_id) : "",
      is_active: emp.is_active !== false,
    });
    setEditModalOpen(true);
  };

  const handleShiftSelect = (sName: string) => {
    const found = shifts.find((s) => s.shift_name === sName);
    if (found) {
      setEditForm((prev) => ({
        ...prev,
        shift_name: sName,
        shift_start: found.start_time,
        shift_end: found.end_time,
      }));
    } else {
      setEditForm((prev) => ({ ...prev, shift_name: sName }));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setSavingEdit(true);
    try {
      const payload: any = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        department: editForm.department,
        shift_name: editForm.shift_name,
        shift_timing: `${editForm.shift_start} - ${editForm.shift_end}`,
        assigned_workstation_id: editForm.assigned_workstation_id ? Number(editForm.assigned_workstation_id) : null,
        is_active: editForm.is_active,
      };

      await updateEmployee(editingEmp.id, payload);
      toast.success("Employee updated successfully", {
        description: `Profile and shift assignments updated for ${editForm.name}.`,
      });
      setEditModalOpen(false);
      setEditingEmp(null);
      loadEmployees();
    } catch (err: any) {
      toast.error("Failed to update employee", { description: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string | number, name: string) => {
    if (confirm(`Are you sure you want to permanently delete employee "${name}" from the database?`)) {
      setDeletingId(String(id));
      try {
        await deleteEmployee(String(id));
        toast.success(`Employee "${name}" deleted from database`);
        loadEmployees();
      } catch (err: any) {
        console.error("Delete employee failed:", err);
        toast.error("Failed to delete employee", { description: err.message });
      } finally {
        setDeletingId(null);
      }
    }
  };

  const formatDateSafe = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return String(dateStr);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      emp.name?.toLowerCase().includes(s) ||
      emp.employee_id?.toLowerCase().includes(s) ||
      emp.department?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Employees Roster</h1>
          <p className="text-sm text-[#666666] mt-0.5">
            Enrolled employees, shift schedules, assigned workstations, and profile management
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-64">
            <Input
              placeholder="Search employee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9 shadow-xs"
            />
          </div>
          <Link href="/dashboard/employees/new">
            <Button className="bg-[#111111] hover:bg-neutral-800 text-white flex items-center gap-2 text-xs font-semibold shadow-xs h-9">
              <UserPlus className="w-4 h-4" /> Add Employee
            </Button>
          </Link>
        </div>
      </div>

      {/* Employees Table */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee ID</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Name</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Assigned Shift</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Shift Timing</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Department</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Status</TableHead>
                <TableHead className="text-right font-semibold text-[#111111] text-xs py-3 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {!mounted ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-[#666666] text-xs">
                    Loading roster...
                  </TableCell>
                </TableRow>
              ) : filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-[#666666] text-xs">
                    No employees registered matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((emp) => (
                  <TableRow key={emp.id} className="hover:bg-neutral-50 transition-colors">
                    <TableCell className="text-[#666666] font-mono text-xs">{emp.employee_id}</TableCell>
                    <TableCell className="text-[#111111] font-semibold text-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-[#E5E7EB] text-[#111111] flex items-center justify-center font-bold text-xs">
                          {emp.name ? emp.name.charAt(0).toUpperCase() : "E"}
                        </div>
                        <div>
                          <div>{emp.name}</div>
                          {emp.email && <div className="text-[11px] text-[#666666] font-normal">{emp.email}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-[#111111] font-semibold block">
                        {emp.shift_name || "General Shift"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-[#111111] font-mono block">
                        {emp.shift_timing || "09:00 - 18:00"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#666666] text-xs">{emp.department || "General"}</TableCell>
                    <TableCell>
                      {emp.is_active !== false ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-[#666666] border border-[#E5E7EB]">
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(emp)}
                          className="h-8 px-2.5 text-xs border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 font-medium"
                          title="Edit Employee"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <Link href={`/dashboard/employees/${emp.id}`}>
                          <Button variant="ghost" size="icon" className="text-[#666666] hover:text-[#111111] hover:bg-neutral-100 h-8 w-8">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          disabled={deletingId === String(emp.id)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 w-8"
                          onClick={() => handleDelete(emp.id, emp.name)}
                          title="Delete Employee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Employee Modal */}
      {editModalOpen && editingEmp && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-[#E5E7EB] shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111111] flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-[#111111]" /> Edit Employee Profile
                </h3>
                <p className="text-xs text-[#666666] mt-0.5">
                  Update employee details, shift schedule, and position assignment
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-[#666666] hover:text-[#111111] p-1 rounded-md hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Employee ID (Fixed)</Label>
                    <Input
                      value={editForm.employee_id}
                      disabled
                      className="bg-neutral-100 border-[#E5E7EB] text-[#666666] text-xs font-mono h-9 cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Full Name *</Label>
                    <Input
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Email Address</Label>
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Phone Number</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Department</Label>
                    <Input
                      value={editForm.department}
                      onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Assigned Workstation</Label>
                    <select
                      value={editForm.assigned_workstation_id}
                      onChange={(e) => setEditForm((p) => ({ ...p, assigned_workstation_id: e.target.value }))}
                      className="w-full bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] font-medium h-9 focus:outline-none"
                    >
                      <option value="">Not Assigned</option>
                      {workstations.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-[#111111]">Assigned Shift</Label>
                  <select
                    value={editForm.shift_name}
                    onChange={(e) => handleShiftSelect(e.target.value)}
                    className="w-full bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] font-medium h-9 focus:outline-none"
                  >
                    <option value="Day Shift">Day Shift (09:00 - 18:00)</option>
                    <option value="Night Shift">Night Shift (20:00 - 05:00 - Crosses Midnight)</option>
                    <option value="Morning Shift">Morning Shift (06:00 - 14:00)</option>
                    <option value="Evening Shift">Evening Shift (14:00 - 22:00)</option>
                    <option value="General Shift">General Shift (09:00 - 18:00)</option>
                    <option value="Custom Shift">Custom Shift</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Shift Start Time</Label>
                    <Input
                      type="time"
                      value={editForm.shift_start}
                      onChange={(e) => setEditForm((p) => ({ ...p, shift_start: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#111111]">Shift End Time</Label>
                    <Input
                      type="time"
                      value={editForm.shift_end}
                      onChange={(e) => setEditForm((p) => ({ ...p, shift_end: e.target.value }))}
                      className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-[#111111]">Employment Status</Label>
                  <select
                    value={editForm.is_active ? "active" : "inactive"}
                    onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.value === "active" }))}
                    className="w-full bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] font-medium h-9 focus:outline-none"
                  >
                    <option value="active">Active (Eligible for Attendance & Workstation Monitoring)</option>
                    <option value="inactive">Inactive / On Leave</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-[#E5E7EB] bg-neutral-50 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditModalOpen(false)}
                  disabled={savingEdit}
                  className="border-[#E5E7EB] text-[#111111] bg-white hover:bg-neutral-100 text-xs font-medium h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold h-9 shadow-xs"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
