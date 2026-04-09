from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import dlib
import time
import math
import os

app = Flask(__name__)
CORS(app)

# ── dlib setup ─────────────────────────────────────────────────────────────────
# Face detector (HOG-based, fast and accurate)
detector = dlib.get_frontal_face_detector()

# 68-point shape predictor — download from:
# http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
# Extract and place shape_predictor_68_face_landmarks.dat in the ml/ folder
PREDICTOR_PATH = os.path.join(os.path.dirname(__file__), "shape_predictor_68_face_landmarks.dat")

if not os.path.exists(PREDICTOR_PATH):
    raise FileNotFoundError(
        f"\n\n❌ Missing: {PREDICTOR_PATH}\n"
        "Download from: http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2\n"
        "Extract and place shape_predictor_68_face_landmarks.dat in the ml/ folder.\n"
    )

predictor = dlib.shape_predictor(PREDICTOR_PATH)

# ── dlib 68-point landmark indices for eyes (0-indexed) ───────────────────────
#   Right eye: landmarks 36–41
#   Left eye:  landmarks 42–47
RIGHT_EYE_START = 36
RIGHT_EYE_END   = 42
LEFT_EYE_START  = 42
LEFT_EYE_END    = 48

# ── Blink detection config ────────────────────────────────────────────────────
EAR_THRESHOLD     = 0.25   # EAR below this = eye closed; tune 0.20–0.28 if needed
BLINK_RATE_WINDOW = 60     # rolling window in seconds for blink rate calculation

# ── Session state (global, reset via /reset endpoint) ─────────────────────────
blink_count      = 0
eye_was_closed   = False   # True when EAR was below threshold on previous frame
blink_timestamps = []      # unix timestamps of each completed blink
session_start    = time.time()


# ── Helper functions ──────────────────────────────────────────────────────────

def shape_to_points(shape, start, end):
    """Convert dlib shape landmark range [start, end) to list of (x, y) tuples."""
    return [(shape.part(i).x, shape.part(i).y) for i in range(start, end)]


def euclidean(p1, p2):
    """Euclidean distance between two (x, y) points."""
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def eye_aspect_ratio(eye_points):
    """
    Compute Eye Aspect Ratio (EAR) from 6 landmark points.

    dlib eye point order:
      [0] left corner
      [1] upper-left lid
      [2] upper-right lid
      [3] right corner
      [4] lower-right lid
      [5] lower-left lid

    EAR = (||p1-p5|| + ||p2-p4||) / (2 * ||p0-p3||)

    Open eye  → EAR ≈ 0.28–0.35
    Closed eye → EAR ≈ 0.0–0.20
    """
    v1 = euclidean(eye_points[1], eye_points[5])   # vertical pair 1
    v2 = euclidean(eye_points[2], eye_points[4])   # vertical pair 2
    h  = euclidean(eye_points[0], eye_points[3])   # horizontal width

    return (v1 + v2) / (2.0 * h) if h > 0 else 0.0


def blink_rate_per_minute(timestamps):
    """
    Blinks per minute over the last BLINK_RATE_WINDOW seconds.
    Falls back to session-wide average while the window is still filling.
    """
    now    = time.time()
    recent = [t for t in timestamps if now - t <= BLINK_RATE_WINDOW]

    if len(recent) < 2:
        # Not enough recent data — use session average
        elapsed = now - session_start
        if elapsed < 5:
            return 0.0
        return round((blink_count / elapsed) * 60, 1)

    span = recent[-1] - recent[0]
    if span <= 0:
        return 0.0
    return round((len(recent) / span) * 60, 1)


# ── Flask routes ──────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "server": "python-ml-dlib", "port": 5000})


@app.route("/reset", methods=["POST"])
def reset():
    """Reset all blink counters. Called by frontend when camera stops."""
    global blink_count, eye_was_closed, blink_timestamps, session_start
    blink_count      = 0
    eye_was_closed   = False
    blink_timestamps = []
    session_start    = time.time()
    return jsonify({"status": "reset"})


@app.route("/analyze", methods=["POST"])
def analyze():
    global blink_count, eye_was_closed, blink_timestamps

    # ── 1. Decode base64 JPEG sent by React ───────────────────────────────────
    data = request.json.get("image", "")
    if not data:
        return jsonify({"error": "No image data in request"}), 400

    try:
        img_bytes = base64.b64decode(data.split(",")[1])
        np_arr    = np.frombuffer(img_bytes, np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        return jsonify({"error": f"Image decode failed: {str(e)}"}), 400

    if frame is None:
        return jsonify({"error": "Could not decode image frame"}), 400

    # ── 2. Convert to grayscale (dlib works on grayscale) ─────────────────────
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # ── 3. Detect faces using dlib HOG detector ───────────────────────────────
    # upsample_num_times=1 helps detect smaller/further faces at slight perf cost
    faces = detector(gray, 1)

    if len(faces) == 0:
        # No face found — return current counts unchanged
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

    # Use the first (largest) face only
    face  = faces[0]
    shape = predictor(gray, face)

    # ── 4. Extract eye landmarks and compute EAR ──────────────────────────────
    left_pts  = shape_to_points(shape, LEFT_EYE_START,  LEFT_EYE_END)
    right_pts = shape_to_points(shape, RIGHT_EYE_START, RIGHT_EYE_END)

    left_ear  = eye_aspect_ratio(left_pts)
    right_ear = eye_aspect_ratio(right_pts)
    avg_ear   = (left_ear + right_ear) / 2.0

    # ── 5. Blink state machine ────────────────────────────────────────────────
    # A blink = EAR drops below threshold (eye closes) then rises back (eye opens)
    eye_is_closed = avg_ear < EAR_THRESHOLD

    if eye_is_closed and not eye_was_closed:
        # Transition: open → closed
        eye_was_closed = True

    elif not eye_is_closed and eye_was_closed:
        # Transition: closed → open = one complete blink
        blink_count += 1
        blink_timestamps.append(time.time())
        eye_was_closed = False

        # Trim timestamps older than 2× the window to keep memory low
        cutoff = time.time() - (BLINK_RATE_WINDOW * 2)
        blink_timestamps = [t for t in blink_timestamps if t >= cutoff]

    # ── 6. Respond ────────────────────────────────────────────────────────────
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
    print(f"   Shape predictor : {PREDICTOR_PATH}")
    print(f"   EAR threshold   : {EAR_THRESHOLD}")
    app.run(port=5000, debug=True, use_reloader=False)