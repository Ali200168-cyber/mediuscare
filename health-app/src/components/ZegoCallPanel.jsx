import { useEffect, useRef, useState } from "react";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import { API_URL } from "../config/api";
import "../styles/Patient/ZegoCallPanel.css";

export default function ZegoCallPanel({ consultation, onClose }) {
  const containerRef = useRef(null);
  const zpRef = useRef(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting...");

  const fetchWithAuth = (url, opts = {}) => {
    const token = localStorage.getItem("token");
    return fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  useEffect(() => {
    let mounted = true;
    document.body.classList.add("call-active");

    const join = async () => {
      try {
        // Extra validation gives clearer errors when room isn't created yet.
        const validateRes = await fetchWithAuth(`${API_URL}/api/zego/validate/${consultation._id}`);
        const validate = await validateRes.json().catch(() => null);
        if (validateRes.ok && validate?.success && validate.valid === false) {
          throw new Error(validate.reason || "Video room is not ready yet. Please generate the call first.");
        }

        const res = await fetchWithAuth(`${API_URL}/api/zego/session/${consultation._id}`, { method: "POST" });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to initialize ZEGOCLOUD session");

        const { appId, token, roomId, userId, userName } = data.session;
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(Number(appId), token, roomId, String(userId), String(userName));
        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;

        // In dev/strict mode refs can be temporarily null; wait one frame.
        if (!containerRef.current) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        if (!containerRef.current) throw new Error("Call container not ready. Please try again.");

        zp.joinRoom({
          container: containerRef.current,
          scenario: { mode: ZegoUIKitPrebuilt.VideoConference },
          showPreJoinView: true,
          turnOnCameraWhenJoining: true,
          turnOnMicrophoneWhenJoining: true,
          showScreenSharingButton: false,
          onJoinRoom: () => mounted && setStatus("Connected"),
          onLeaveRoom: () => mounted && onClose(),
        });
      } catch (joinError) {
        setError(String(joinError?.message || "Failed to join call"));
        setStatus("Failed");
      }
    };

    join();
    return () => {
      mounted = false;
      document.body.classList.remove("call-active");
      if (zpRef.current) {
        try {
          zpRef.current.destroy();
        } catch {}
        zpRef.current = null;
      }
    };
  }, [consultation?._id]);

  return (
    <div className="zego-overlay">
      <div className="zego-panel">
        <div className="zego-header">
          <div>
            <h3>ZEGOCLOUD Video Call</h3>
            <p>Status: {status}</p>
          </div>
          <button className="zego-close-btn" onClick={onClose}>Close</button>
        </div>
        {error && <p className="zego-error">{error}</p>}
        <div ref={containerRef} className="zego-container" />
      </div>
    </div>
  );
}
