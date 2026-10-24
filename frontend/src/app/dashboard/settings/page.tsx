"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    yolo_conf: 0.5,
    face_sim_threshold: 0.7,
    dup_window: 60
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(settings);
      toast.success("Success", { description: "Settings saved successfully." });
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">Settings</h2>
      
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-white">System Configuration</CardTitle>
          <CardDescription className="text-neutral-400">
            Adjust AI confidence thresholds and behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-neutral-300">YOLO Confidence Threshold (0.0 - 1.0)</Label>
            <Input 
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={settings.yolo_conf}
              onChange={e => setSettings(s => ({...s, yolo_conf: parseFloat(e.target.value)}))}
              className="bg-neutral-950 border-neutral-800 text-white"
            />
            <p className="text-xs text-neutral-500">Lower values detect more faces but may increase false positives.</p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-neutral-300">Face Similarity Threshold (0.0 - 1.0)</Label>
            <Input 
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={settings.face_sim_threshold}
              onChange={e => setSettings(s => ({...s, face_sim_threshold: parseFloat(e.target.value)}))}
              className="bg-neutral-950 border-neutral-800 text-white"
            />
            <p className="text-xs text-neutral-500">How strict the face recognition should be (higher = stricter).</p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-neutral-300">Duplicate Window (Seconds)</Label>
            <Input 
              type="number"
              min="0"
              value={settings.dup_window}
              onChange={e => setSettings(s => ({...s, dup_window: parseInt(e.target.value)}))}
              className="bg-neutral-950 border-neutral-800 text-white"
            />
            <p className="text-xs text-neutral-500">Time window before logging the same person again.</p>
          </div>
          
          <div className="pt-4 flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
