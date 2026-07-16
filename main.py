import cv2
from insightface.app import FaceAnalysis
import numpy as np
import pickle
from datetime import datetime
from database.attendance import mark_attendance

# Load model
app = FaceAnalysis(name='buffalo_l')
app.prepare(ctx_id=0)

# Load stored embeddings
with open("data/embeddings.pkl", "rb") as f:
    known_embeddings, names = pickle.load(f)

# Normalize embeddings
known_embeddings = known_embeddings / np.linalg.norm(known_embeddings, axis=1, keepdims=True)

# Attendance tracking
already_marked_today = set()

cap = cv2.VideoCapture(0)

def recognize(face_embedding):
    face_embedding = face_embedding / np.linalg.norm(face_embedding)

    similarities = np.dot(known_embeddings, face_embedding)
    index = np.argmax(similarities)
    max_sim = similarities[index]

    if max_sim > 0.5:   # threshold (adjust if needed)
        return names[index]
    return "Unknown"

while True:
    ret, frame = cap.read()
    if not ret:
        break

    faces = app.get(frame)

    for face in faces:
        bbox = face.bbox.astype(int)
        embedding = face.embedding

        name = recognize(embedding)

        today = datetime.now().date()

        if name != "Unknown" and name not in already_marked_today:
            already_marked_today.add(name)

            print(f"{name} marked present on {today}")
            mark_attendance(name)

        # Draw
        x1, y1, x2, y2 = bbox
        cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
        cv2.putText(frame, name, (x1,y1-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,255,0), 2)

    cv2.imshow("InsightFace Attendance", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()