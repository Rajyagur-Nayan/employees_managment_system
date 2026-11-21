"""
Comprehensive Benchmark Script:
Tests the optimized pipeline on real enrolled face images at 640x480 resolution.
Measures latency, FPS, CPU %, RAM (MB), and recognition accuracy.
"""

import sys
import os
import time
import cv2
import numpy as np

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.attendance_engine import AttendanceEngine
from core.enrollment import EnrollmentManager
import psutil

def run_benchmark():
    print("=" * 60)
    print("RUNNING OPTIMIZED PIPELINE BENCHMARK")
    print("=" * 60)

    # 1. Load enrollment manager
    enrollment = EnrollmentManager()
    engine = AttendanceEngine(enrollment)

    # 2. Load test face image
    test_img_path = os.path.join("..", "data", "known_faces", "EMP005_Rajyaguru_Nayan_Kishorbhai", "ChatGPT Image Aug 21, 2026, 10_21_25 PM.png")
    if not os.path.exists(test_img_path):
        test_img_path = os.path.join("data", "known_faces", "EMP005_Rajyaguru_Nayan_Kishorbhai", "ChatGPT Image Aug 21, 2026, 10_21_25 PM.png")

    if not os.path.exists(test_img_path):
        print(f"Error: Test image not found at {test_img_path}")
        return

    raw_frame = cv2.imread(test_img_path)
    if raw_frame is None:
        print("Error: Could not read image.")
        return

    # Resize to 640x480 (standard camera resolution)
    frame = cv2.resize(raw_frame, (640, 480))
    print(f"Loaded test frame: {frame.shape[1]}x{frame.shape[0]}")

    # Warm-up (2 frames)
    for _ in range(2):
        engine.process_frame(frame, None)

    process = psutil.Process()
    ram_before = process.memory_info().rss / (1024 * 1024)
    cpu_before = psutil.cpu_percent(interval=None)

    TOTAL_FRAMES = 30
    frame_latencies = []
    recognized_events = []

    print(f"Processing {TOTAL_FRAMES} frames through AttendanceEngine...")
    t_start = time.perf_counter()

    for i in range(TOTAL_FRAMES):
        t0 = time.perf_counter()
        events, annotated, debug = engine.process_frame(frame, None)
        t_elapsed = (time.perf_counter() - t0) * 1000
        frame_latencies.append(t_elapsed)

        for ev in events:
            if ev.get("employee_id"):
                recognized_events.append(ev)

    total_time = time.perf_counter() - t_start
    avg_fps = TOTAL_FRAMES / total_time
    avg_latency = np.mean(frame_latencies)
    p95_latency = np.percentile(frame_latencies, 95)
    ram_after = process.memory_info().rss / (1024 * 1024)
    cpu_after = psutil.cpu_percent(interval=0.2)

    print("-" * 60)
    print("BENCHMARK RESULTS:")
    print(f"  Total Frames Processed: {TOTAL_FRAMES}")
    print(f"  Total Time:             {total_time:.2f} s")
    print(f"  Average Processing FPS: {avg_fps:.2f} FPS")
    print(f"  Average Latency:        {avg_latency:.2f} ms / frame")
    print(f"  95th Percentile Latency:{p95_latency:.2f} ms")
    print(f"  RAM Usage:              {ram_after:.1f} MB (Delta: {ram_after - ram_before:+.1f} MB)")
    print(f"  CPU Usage:              {cpu_after:.1f}%")
    print("-" * 60)
    print("RECOGNITION ACCURACY:")
    if recognized_events:
        last_ev = recognized_events[-1]
        print(f"  Detected Employee:      {last_ev.get('employee_name')} ({last_ev.get('employee_id')})")
        print(f"  Confidence Score:       {last_ev.get('confidence')}")
        print(f"  Status:                 {last_ev.get('status')}")
        print(f"  Verified Correctly:     {'YES' if last_ev.get('employee_id') == 'EMP005' else 'NO'}")
    else:
        print("  No recognized events logged.")

    # Cleanup background worker
    engine.attendance_queue.stop(drain=True)
    print("=" * 60)

if __name__ == "__main__":
    run_benchmark()
