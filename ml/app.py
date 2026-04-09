from flask import Flask, request, jsonify
import cv2
import numpy as np
import base64
import mediapipe as mp

app = Flask(__name__)

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh()

blink_count = 0

@app.route("/analyze", methods=["POST"])
def analyze():
    global blink_count

    data = request.json["image"]
    img_data = base64.b64decode(data.split(",")[1])
    np_arr = np.frombuffer(img_data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        blink_count += 1  # simplified for now

        return jsonify({
            "blinks": blink_count,
            "blink_rate": blink_count
        })

    return jsonify({
        "blinks": blink_count,
        "blink_rate": blink_count
    })


if __name__ == "__main__":
    app.run(port=5000, debug=True)