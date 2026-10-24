"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

export default function NewEmployeePage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: "",
    employee_id: "",
    email: "",
    phone: "",
    department: ""
  });
  const [images, setImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const data = new FormData();
    data.append("name", formData.name);
    data.append("employee_id", formData.employee_id);
    if (formData.email) data.append("email", formData.email);
    if (formData.phone) data.append("phone", formData.phone);
    if (formData.department) data.append("department", formData.department);
    images.forEach(img => {
      data.append("images", img);
    });

    try {
      await createEmployee(data);
      toast.success("Success", {
        description: "Employee registered successfully."
      });
      router.push("/dashboard/employees");
    } catch (err: any) {
      toast.error("Error", {
        description: err.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">Register Employee</h2>
      
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-white">Employee Details</CardTitle>
          <CardDescription className="text-neutral-400">
            Enter employee information and upload face images for recognition.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee_id" className="text-neutral-300">Employee ID *</Label>
                <Input 
                  id="employee_id" 
                  required 
                  value={formData.employee_id}
                  onChange={e => setFormData(f => ({ ...f, employee_id: e.target.value }))}
                  className="bg-neutral-950 border-neutral-800 text-white" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-neutral-300">Full Name *</Label>
                <Input 
                  id="name" 
                  required 
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="bg-neutral-950 border-neutral-800 text-white" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-neutral-300">Email Address</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  className="bg-neutral-950 border-neutral-800 text-white" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-neutral-300">Phone Number</Label>
                <Input 
                  id="phone" 
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  className="bg-neutral-950 border-neutral-800 text-white" 
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="department" className="text-neutral-300">Department</Label>
                <Input 
                  id="department" 
                  value={formData.department}
                  onChange={e => setFormData(f => ({ ...f, department: e.target.value }))}
                  className="bg-neutral-950 border-neutral-800 text-white" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-neutral-300">Face Images *</Label>
              <div className="border-2 border-dashed border-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-neutral-800/20 transition-colors">
                <Upload className="w-8 h-8 text-neutral-500" />
                <p className="text-sm text-neutral-400">Click to upload or drag and drop</p>
                <p className="text-xs text-neutral-500">Multiple clear face photos (JPEG, PNG)</p>
                <Input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                />
              </div>
              
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  {images.map((img, i) => (
                    <div key={i} className="relative group aspect-square rounded-md overflow-hidden bg-neutral-950 border border-neutral-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={URL.createObjectURL(img)} 
                        alt="Face preview" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Registering..." : "Register Employee"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
