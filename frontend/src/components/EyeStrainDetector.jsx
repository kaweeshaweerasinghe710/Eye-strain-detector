import { useState, useRef, useEffect } from "react";
import { Camera, CameraOff, Eye, AlertTriangle } from "lucide-react";

export default function EyeStrainDetector() {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [blinkRate, setBlinkRate] = useState(0);
  const [isLowBlinkRate, setIsLowBlinkRate] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // 🎥 Start Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      setIsCameraOn(true);

      startDetectionLoop();
    } catch (err) {
      console.error("Camera error:", err);
      alert("Camera access denied!");
    }
  };

  // 🛑 Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsCameraOn(false);
    setBlinkCount(0);
    setBlinkRate(0);
    setIsLowBlinkRate(false);
  };

  // 📸 Capture frame and send to backend
  const captureFrameAndSend = async () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);

    const imageData = canvas.toDataURL("image/jpeg");

    try {
      const res = await fetch("http://localhost:5000/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: imageData }),
      });

      const data = await res.json();

      setBlinkCount(data.blinks);
      setBlinkRate(data.blink_rate);

      if (data.blink_rate < 15 && data.blinks > 5) {
        setIsLowBlinkRate(true);
      } else {
        setIsLowBlinkRate(false);
      }
    } catch (err) {
      console.error("API error:", err);
    }
  };

  // 🔁 Detection loop
  const startDetectionLoop = () => {
    intervalRef.current = setInterval(() => {
      captureFrameAndSend();
    }, 1000); // every 1 second
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6">
          <div className="flex items-center gap-3">
            <Eye className="w-8 h-8 text-white" />
            <h1 className="text-2xl font-bold text-white">
              Eye Strain Detector
            </h1>
          </div>
        </div>

        <div className="p-6">

          {/* Video */}
          <div className="bg-gray-900 rounded-xl overflow-hidden mb-6 relative aspect-video">
            {isCameraOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <div className="text-center">
                  <CameraOff className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Camera is off</p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-4 mb-6">
            {!isCameraOn ? (
              <button
                onClick={startCamera}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Start Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2"
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
                <div className="bg-emerald-50 rounded-lg p-4">
                  <div className="text-sm text-emerald-600 font-medium mb-1">
                    Total Blinks
                  </div>
                  <div className="text-3xl font-bold text-emerald-900">
                    {blinkCount}
                  </div>
                </div>

                <div
                  className={`rounded-lg p-4 ${
                    isLowBlinkRate ? "bg-rose-50" : "bg-teal-50"
                  }`}
                >
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isLowBlinkRate ? "text-rose-600" : "text-teal-600"
                    }`}
                  >
                    Blink Rate (per min)
                  </div>
                  <div
                    className={`text-3xl font-bold ${
                      isLowBlinkRate ? "text-rose-900" : "text-teal-900"
                    }`}
                  >
                    {blinkRate}
                  </div>
                </div>
              </div>

              {/* Warning */}
              {isLowBlinkRate && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="font-semibold text-orange-900">
                      Low Blink Rate Detected
                    </div>
                    <p className="text-sm text-orange-700">
                      Your blink rate is low. Take a break and rest your eyes.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}