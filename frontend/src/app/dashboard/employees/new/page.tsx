"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, getEmployees, getNextEmployeeId, getShifts } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, UserPlus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NewEmployeePage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: "",
    employee_id: "",
    email: "",
    phone: "",
    department: "",
    shift_name: "General Shift",
    shift_timing: "09:00 - 18:00"
  });
  const [availableShifts, setAvailableShifts] = useState<any[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleShiftChange = (shift: string) => {
    let timing = "09:00 - 18:00";
    const found = availableShifts.find((s) => s.shift_name === shift);
    if (found && found.start_time && found.end_time) {
      timing = `${found.start_time} - ${found.end_time}`;
    } else if (shift === "Morning Shift") timing = "06:00 - 14:00";
    else if (shift === "Evening Shift") timing = "14:00 - 22:00";
    else if (shift === "Night Shift") timing = "22:00 - 06:00";
    else if (shift === "General Shift") timing = "09:00 - 18:00";

    setFormData(prev => ({
      ...prev,
      shift_name: shift,
      shift_timing: shift === "Custom" ? prev.shift_timing : timing
    }));
  };

  useEffect(() => {
    // 1. Fetch next sequential employee ID based on current database order
    getNextEmployeeId()
      .then((res: any) => {
        if (res?.next_employee_id) {
          setFormData((prev) => ({
            ...prev,
            employee_id: res.next_employee_id,
          }));
        }
      })
      .catch((err) => {
        console.warn("Could not get next employee ID from server endpoint, falling back to local scan:", err);
        getEmployees()
          .then((employees: any[]) => {
            let maxNum = (employees || []).length;
            (employees || []).forEach((emp: any) => {
              const m = String(emp.employee_id || "").match(/(\d+)/);
              if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxNum) maxNum = n;
              }
            });
            const nextId = `EMP${String(maxNum + 1).padStart(3, "0")}`;
            setFormData((prev) => ({
              ...prev,
              employee_id: prev.employee_id || nextId,
            }));
          })
          .catch(() => {
            setFormData((prev) => ({
              ...prev,
              employee_id: prev.employee_id || "EMP001",
            }));
          });
      });

    // 2. Fetch available shifts from database
    getShifts()
      .then((sList: any[]) => {
        if (sList && sList.length > 0) {
          setAvailableShifts(sList);
        }
      })
      .catch(() => {});
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(prev => [...prev, ...Array.from(e.target.files as FileList)]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0) {
      toast.error("Images required", {
        description: "Please upload at least one face image."
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.append("name", formData.name.trim());
      data.append("employee_id", formData.employee_id.trim());
      if (formData.email?.trim()) data.append("email", formData.email.trim());
      if (formData.phone?.trim()) data.append("phone", formData.phone.trim());
      data.append("department", formData.department?.trim() || "General");
      data.append("shift_name", formData.shift_name?.trim() || "General Shift");
      data.append("shift_timing", formData.shift_timing?.trim() || "09:00 - 18:00");

      images.forEach((img) => {
        data.append("images", img);
        data.append("files", img);
      });

      await createEmployee(data);
      toast.success("Employee registered successfully", {
        description: `${formData.name} (${formData.employee_id}) has been added.`
      });
      router.push("/dashboard/employees");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to register employee", {
        description: err.message || "An error occurred during registration."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/employees">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 bg-white shadow-xs">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111] flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-[#111111]" /> Register Employee
          </h2>
          <p className="text-sm text-[#666666]">
            Enter employee profile information, assign shifts, and upload face training samples.
          </p>
        </div>
      </div>
      
      <Card className="bg-white border-[#E5E7EB] shadow-xs">
        <CardHeader className="border-b border-[#E5E7EB]">
          <CardTitle className="text-[#111111] text-base font-bold">Employee Profile & Shift Details</CardTitle>
          <CardDescription className="text-[#666666] text-xs">
            Face embeddings will be computed and stored in the database for automatic recognition.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="employee_id" className="text-xs font-semibold text-[#111111]">Employee ID *</Label>
                <Input 
                  id="employee_id" 
                  required 
                  value={formData.employee_id}
                  onChange={e => setFormData(f => ({ ...f, employee_id: e.target.value }))}
                  placeholder="e.g. EMP001"
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
                <p className="text-[11px] text-[#666666]">
                  Auto-assigned according to current database order (e.g. EMP001, EMP002).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-[#111111]">Full Name *</Label>
                <Input 
                  id="name" 
                  required 
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. John Doe"
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[#111111]">Email Address</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  placeholder="e.g. john@example.com"
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold text-[#111111]">Phone Number</Label>
                <Input 
                  id="phone" 
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. +91 9876543210"
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="department" className="text-xs font-semibold text-[#111111]">Department</Label>
                <Input 
                  id="department" 
                  value={formData.department}
                  onChange={e => setFormData(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Operations"
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shift_name" className="text-xs font-semibold text-[#111111]">Assigned Shift</Label>
                <select
                  id="shift_name"
                  value={formData.shift_name}
                  onChange={e => handleShiftChange(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111111] text-sm shadow-xs focus:outline-none focus:border-[#111111]"
                >
                  {availableShifts.length > 0 ? (
                    availableShifts.map((s) => (
                      <option key={s.id} value={s.shift_name}>
                        {s.shift_name} ({s.timing || `${s.start_time} - ${s.end_time}`})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="General Shift">General Shift (09:00 - 18:00)</option>
                      <option value="Morning Shift">Morning Shift (06:00 - 14:00)</option>
                      <option value="Evening Shift">Evening Shift (14:00 - 22:00)</option>
                      <option value="Night Shift">Night Shift (22:00 - 06:00)</option>
                    </>
                  )}
                  <option value="Custom">Custom Shift</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shift_timing" className="text-xs font-semibold text-[#111111]">Shift Timing (Start - End)</Label>
                <Input 
                  id="shift_timing" 
                  placeholder="e.g. 09:00 - 18:00"
                  value={formData.shift_timing}
                  onChange={e => setFormData(f => ({ ...f, shift_timing: e.target.value }))}
                  className="bg-white border-[#E5E7EB] text-[#111111] shadow-xs text-sm focus:border-[#111111]" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold text-[#111111]">Face Images *</Label>
              <div className="relative border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-neutral-50 transition-colors bg-neutral-50/50">
                <Upload className="w-8 h-8 text-[#666666]" />
                <p className="text-sm font-medium text-[#111111]">Click to upload or drag and drop</p>
                <p className="text-xs text-[#666666]">Multiple clear face photos (JPEG, PNG)</p>
                <Input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                />
              </div>
              
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-4 mt-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-neutral-100 border border-[#E5E7EB] shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={URL.createObjectURL(img)} 
                        alt="Face preview" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-[#111111]/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
              <Button type="button" variant="outline" onClick={() => router.back()} className="border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#111111] hover:bg-neutral-800 text-white font-semibold text-xs shadow-xs">
                {isSubmitting ? "Registering..." : "Register Employee"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
