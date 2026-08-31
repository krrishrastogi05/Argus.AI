import { useState } from "react";
import { api, fileToBase64 } from "../services/api";
import { Mic, Radio } from "lucide-react";

export default function HelplineSimulator() {
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [status, setStatus] = useState("IDLE");

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      newRecorder.ondataavailable = (e) => chunks.push(e.data);
      newRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); // release the microphone
        // Browsers cannot record MP3. Send the real type (webm/opus), or Gemini cannot read it.
        const mimeType = (newRecorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], "call.webm", { type: mimeType });
        processCall(file);
      };

      newRecorder.start();
      setRecorder(newRecorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone Error:", err);
      setStatus("MIC_ERROR");
    }
  };

  const stopRecord = () => {
    if (recorder) {
      recorder.stop();
      setIsRecording(false);
    }
  };

  const processCall = async (audioFile: File) => {
    setStatus("ANALYZING_VOICE");
    try {
      await api("/reports", {
        method: "POST",
        body: {
          channel: "HELPLINE",
          media: { data: await fileToBase64(audioFile), mimeType: audioFile.type },
          clientRequestId: crypto.randomUUID(),
        },
      });

      setStatus("DISPATCHED");
      setTimeout(() => setStatus("IDLE"), 3000);
    } catch (error) {
      console.error(error);
      setStatus("ERROR");
    }
  };

  return (
    <div className="h-full bg-slate-900 flex flex-col">
      {/* HEADER */}
      <div className="w-full bg-slate-950 border-b border-slate-800 p-4 text-center">
        <h2 className="text-white font-bold flex items-center justify-center gap-2">
          <Radio className="text-red-500" /> EMERGENCY HELPLINE
        </h2>
        <p className="text-xs text-slate-500 font-mono mt-1">
          SIMULATION: INGESTING DISTRESS CALLS VIA VOICE AI
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className={`w-48 h-48 rounded-full border-4 flex items-center justify-center cursor-pointer transition-all ${
            isRecording
              ? "border-red-500 bg-red-900/20 scale-110 shadow-[0_0_50px_rgba(239,68,68,0.5)]"
              : "border-slate-700 bg-slate-800 hover:border-slate-600"
          }`}
          onMouseDown={startRecord}
          onMouseUp={stopRecord}
          onTouchStart={startRecord}
          onTouchEnd={stopRecord}
        >
          <Mic
            className={`w-20 h-20 ${
              isRecording ? "text-red-500 animate-pulse" : "text-slate-500"
            }`}
          />
        </div>
        <p className="mt-8 text-slate-400 font-mono text-center text-lg">
          {status === "IDLE" && "HOLD BUTTON TO SPEAK"}
          {status === "ANALYZING_VOICE" && (
            <span className="animate-pulse text-cyan-400">
              ANALYZING AUDIO STREAM...
            </span>
          )}
          {status === "DISPATCHED" && (
            <span className="text-green-400 font-bold">
              CALL LOGGED - COMMAND CENTRE NOTIFIED
            </span>
          )}
          {status === "MIC_ERROR" && (
            <span className="text-red-500">MICROPHONE ACCESS DENIED</span>
          )}
          {status === "ERROR" && (
            <span className="text-red-500">SYSTEM ERROR</span>
          )}
        </p>
      </div>
    </div>
  );
}
