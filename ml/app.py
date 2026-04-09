from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import time
import math
import mediapipe as mp


app = Flask(__name__)
CORS(app)

# MediaPipe setup 
face_mesh = mp.solutions.face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

mp_drawing = mp.solutions.drawing_utils

# MediaPipe Eye Landmark Indices (6 points per eye for EAR) 
LEFT_EYE_INDICES  = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

# Blink detection config 
EAR_THRESHOLD     = 0.20   # EAR below this = eye closed 
BLINK_RATE_WINDOW = 60     # rolling window in seconds for blink rate calculation

# Session state (global, reset via /reset endpoint)
blink_count      = 0
eye_was_closed   = False   
blink_timestamps = []      
session_start    = time.time()


# Helper functions 

def euclidean(p1, p2):
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

def eye_aspect_ratio(eye_points):
    v1 = euclidean(eye_points[1], eye_points[5])   
    v2 = euclidean(eye_points[2], eye_points[4])   
    h  = euclidean(eye_points[0], eye_points[3])   
    return (v1 + v2) / (2.0 * h) if h > 0 else 0.0

def get_landmarks(landmarks, indices, img_w, img_h):
    return [(landmarks[i].x * img_w, landmarks[i].y * img_h) for i in indices]

def blink_rate_per_minute(timestamps):
    now    = time.time()
    recent = [t for t in timestamps if now - t <= BLINK_RATE_WINDOW]

    if len(recent) < 2:
        elapsed = now - session_start
        if elapsed < 5:
            return 0.0
        return round((blink_count / elapsed) * 60, 1)

    span = recent[-1] - recent[0]
    if span <= 0:
        return 0.0
    return round((len(recent) / span) * 60, 1)


# Flask routes

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "server": "python-ml-mediapipe", "port": 5000})


@app.route("/reset", methods=["POST"])
def reset():
    global blink_count, eye_was_closed, blink_timestamps, session_start
    blink_count      = 0
    eye_was_closed   = False
    blink_timestamps = []
    session_start    = time.time()
    return jsonify({"status": "reset"})


@app.route("/analyze", methods=["POST"])
def analyze():
    global blink_count, eye_was_closed, blink_timestamps

    data = request.json.get("image", "")
    if not data:
        return jsonify({"error": "No image data in request"}), 400

    try:
        # Decode base64 image perfectly using OpenCV
        img_bytes = base64.b64decode(data.split(",")[1])
        np_arr    = np.frombuffer(img_bytes, np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        return jsonify({"error": f"Image decode failed: {str(e)}"}), 400

    if frame is None:
        return jsonify({"error": "Could not decode image frame"}), 400

    img_h, img_w, _ = frame.shape

    # Convert to RGB (MediaPipe strictly requires RGB)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Process face mesh using MediaPipe
    results = face_mesh.process(rgb_frame)

    if not results.multi_face_landmarks:
        return jsonify({
            "face_detected":    False,
            "blinks":           blink_count,
            "blink_rate":       blink_rate_per_minute(blink_timestamps),
            "tracking_seconds": round(time.time() - session_start, 1),
            "left_ear":         None,
            "right_ear":        None,
            "avg_ear":          None,
            "eye_closed":       False,
        })

    # Use the first detected face
    face_landmarks = results.multi_face_landmarks[0].landmark

    # Extract eye landmarks and compute EAR
    left_pts  = get_landmarks(face_landmarks, LEFT_EYE_INDICES, img_w, img_h)
    right_pts = get_landmarks(face_landmarks, RIGHT_EYE_INDICES, img_w, img_h)

    left_ear  = eye_aspect_ratio(left_pts)
    right_ear = eye_aspect_ratio(right_pts)
    avg_ear   = (left_ear + right_ear) / 2.0

    # Blink state machine
    eye_is_closed = avg_ear < EAR_THRESHOLD

    if eye_is_closed and not eye_was_closed:
        eye_was_closed = True

    elif not eye_is_closed and eye_was_closed:
        blink_count += 1
        blink_timestamps.append(time.time())
        eye_was_closed = False

        cutoff = time.time() - (BLINK_RATE_WINDOW * 2)
        blink_timestamps = [t for t in blink_timestamps if t >= cutoff]

    return jsonify({
        "face_detected":    True,
        "blinks":           blink_count,
        "blink_rate":       blink_rate_per_minute(blink_timestamps),
        "tracking_seconds": round(time.time() - session_start, 1),
        "left_ear":         round(left_ear,  3),
        "right_ear":        round(right_ear, 3),
        "avg_ear":          round(avg_ear,   3),
        "eye_closed":       eye_is_closed,
    })


if __name__ == "__main__":
    print("✅ ML server starting on http://localhost:5000")
    print("   Engine          : MediaPipe FaceMesh")
    print(f"   EAR threshold   : {EAR_THRESHOLD}")
    app.run(port=5000, debug=True, use_reloader=False)