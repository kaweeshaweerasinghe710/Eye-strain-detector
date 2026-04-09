import { useState, useRef, useEffect } from "react";
import { Camera, CameraOff, Eye, AlertTriangle, CheckCircle } from "lucide-react";

export default function EyeStrainDetector() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [blinkRate, setBlinkRate] = useState(0);
  const [isLowBlinkRate, setIsLowBlinkRate] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | running | warning
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Start Camera
  const startCamera = async () => {
    setError(null);
    
    // 1. Tell the backend to reset all global counters
    // Specifically pointing to port 5000 to hit the Python app directly
    try {
      await fetch("http://localhost:5000/reset", {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to reset backend counters:", err);
    }

    // 2. Start the camera stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });

      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      setIsCameraOn(true);
      setStatus("running");
      startDetectionLoop();
    } catch (err) {
      console.error("Camera error:", err);
      setError("Camera access denied. Please allow camera permission.");
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsCameraOn(false);
    setBlinkCount(0);
    setBlinkRate(0);
    setIsLowBlinkRate(false);
    setFaceDetected(false);
    setStatus("idle");
  };

  // Capture frame and send to backend
  const captureFrameAndSend = async () => {
    if (!videoRef.current || !videoRef.current.readyState === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);

    const imageData = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const res = await fetch("http://localhost:4000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();

      setFaceDetected(data.face_detected);
      setBlinkCount(data.blinks);
      setBlinkRate(data.blink_rate);

      // Low blink rate warning: normal rate is 15-20 blinks/min
      // Only warn after enough data (at least 10 seconds tracked)
      if (data.tracking_seconds >= 10 && data.blink_rate < 12) {
        setIsLowBlinkRate(true);
        setStatus("warning");
      } else {
        setIsLowBlinkRate(false);
        setStatus("running");
      }
    } catch (err) {
      console.error("API error:", err);
      setError("Cannot connect to backend. Make sure Node.js server is running on port 4000.");
    }
  };

  // Detection loop — clears any existing interval before starting
  const startDetectionLoop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    intervalRef.current = setInterval(() => {
      captureFrameAndSend();
    }, 1000);
  };

  const getStatusColor = () => {
    if (status === "warning") return "bg-orange-500";
    if (status === "running") return "bg-emerald-500";
    return "bg-gray-400";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-8 h-8 text-white" />
              <div>
                <h1 className="text-2xl font-bold text-white">Eye Strain Detector</h1>
                <p className="text-emerald-100 text-sm">Real-time blink rate monitoring</p>
              </div>
            </div>
            {/* Status indicator */}
            {isCameraOn && (
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()} animate-pulse`} />
                <span className="text-white text-sm font-medium">
                  {status === "warning" ? "Warning" : "Monitoring"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">

          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Video */}
          <div className="bg-gray-900 rounded-xl overflow-hidden mb-6 relative aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isCameraOn ? "hidden" : ""}`}
            />

            {/* Face detection badge */}
            {isCameraOn && (
              <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5
                ${faceDetected ? "bg-emerald-500 text-white" : "bg-gray-700 text-gray-300"}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${faceDetected ? "bg-white" : "bg-gray-400"}`} />
                {faceDetected ? "Face detected" : "No face"}
              </div>
            )}

            {!isCameraOn && (
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <div className="text-center">
                  <CameraOff className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">Camera is off</p>
                  <p className="text-gray-600 text-xs mt-1">Click "Start Camera" to begin</p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-4 mb-6">
            {!isCameraOn ? (
              <button
                onClick={startCamera}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-5 h-5" />
                Start Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CameraOff className="w-5 h-5" />
                Stop Camera
              </button>
            )}
          </div>

          {/* Stats */}
          {isCameraOn && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <div className="text-sm text-emerald-600 font-medium mb-1">Total Blinks</div>
                  <div className="text-4xl font-bold text-emerald-900">{blinkCount}</div>
                  <div className="text-xs text-emerald-500 mt-1">since session start</div>
                </div>

                <div className={`border rounded-xl p-4 ${isLowBlinkRate ? "bg-rose-50 border-rose-100" : "bg-teal-50 border-teal-100"}`}>
                  <div className={`text-sm font-medium mb-1 ${isLowBlinkRate ? "text-rose-600" : "text-teal-600"}`}>
                    Blink Rate
                  </div>
                  <div className={`text-4xl font-bold ${isLowBlinkRate ? "text-rose-900" : "text-teal-900"}`}>
                    {blinkRate}
                  </div>
                  <div className={`text-xs mt-1 ${isLowBlinkRate ? "text-rose-500" : "text-teal-500"}`}>
                    blinks / minute
                  </div>
                </div>
              </div>

              {/* Blink rate gauge bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>0</span>
                  <span className="text-orange-500">Low (&lt;12)</span>
                  <span className="text-emerald-600">Normal (15–20)</span>
                  <span>30+</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      blinkRate < 12 ? "bg-rose-500" :
                      blinkRate < 15 ? "bg-orange-400" :
                      "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min((blinkRate / 30) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Status message */}
              {isLowBlinkRate ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-orange-900">Low Blink Rate Detected</div>
                    <p className="text-sm text-orange-700 mt-0.5">
                      You're blinking less than 12 times per minute. Look away from the screen,
                      blink deliberately a few times, and take a short break.
                    </p>
                    <p className="text-xs text-orange-500 mt-1">Try the 20-20-20 rule: every 20 mins, look 20 feet away for 20 seconds.</p>
                  </div>
                </div>
              ) : blinkRate >= 15 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-emerald-900">Blink Rate is Healthy</div>
                    <p className="text-sm text-emerald-700 mt-0.5">
                      Your blink rate is in the normal range. Keep it up!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
                  Collecting data... keep looking at the camera naturally.
                </div>
              )}
            </>
          )}

          {/* Normal range info */}
          {!isCameraOn && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
              <strong className="block mb-1">How it works</strong>
              The app captures your webcam feed, detects your eyes
              and measures how often you blink. A healthy blink rate is 15–20 times per minute.
              Low blinking is a sign of digital eye strain.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}