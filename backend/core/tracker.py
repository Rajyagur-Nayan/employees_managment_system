"""
core/tracker.py
Wraps DeepSORT to maintain consistent track IDs across frames,
so recognition is only run on new/lost tracks — not every frame.
"""

import numpy as np
from typing import List, Tuple, Dict, Optional
from core.config import DEEPSORT_MAX_AGE, DEEPSORT_N_INIT, DEEPSORT_MAX_DIST

# (track_id, top, right, bottom, left)
Track = Tuple[int, int, int, int, int]


class FaceTracker:
    def __init__(self):
        self._tracker   = None
        self._available = False
        self._load()

    def _load(self):
        try:
            from deep_sort_realtime.deepsort_tracker import DeepSort
            self._tracker = DeepSort(
                max_age=DEEPSORT_MAX_AGE,
                n_init=DEEPSORT_N_INIT,
                max_cosine_distance=DEEPSORT_MAX_DIST,
                nn_budget=None,
                embedder="mobilenet",
                half=False,
                bgr=True,
            )
            self._available = True
            print("[Tracker] DeepSORT loaded.")
        except ImportError:
            print("[Tracker] deep_sort_realtime not installed — tracking disabled.")

    def update(
        self,
        frame_bgr: np.ndarray,
        detections: List[Tuple[int, int, int, int]],   # (top, right, bottom, left)
    ) -> List[Track]:
        """
        Feed detections into DeepSORT.
        Returns list of (track_id, top, right, bottom, left).
        """
        if not self._available or not detections:
            # Passthrough without IDs
            return [(i, *bbox) for i, bbox in enumerate(detections)]

        # DeepSORT expects [([x, y, w, h], confidence, class), ...]
        ds_input = []
        for (top, right, bottom, left) in detections:
            x, y, w, h = left, top, right - left, bottom - top
            ds_input.append(([x, y, w, h], 1.0, "face"))

        tracks = self._tracker.update_tracks(ds_input, frame=frame_bgr)
        results = []
        for t in tracks:
            if not t.is_confirmed():
                continue
            tid      = t.track_id
            l, tl, r, b = t.to_ltrb()
            results.append((tid, int(tl), int(r), int(b), int(l)))
        return results

    @property
    def is_available(self) -> bool:
        return self._available