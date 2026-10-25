"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const subscribeToSpeechSupport = () => () => undefined;
const getSpeechSupport = () => typeof window !== "undefined" && "speechSynthesis" in window;
const getServerSpeechSupport = () => false;

type VoiceControlsProps = {
  text: string;
};

export default function VoiceControls({ text }: VoiceControlsProps) {
  const [speaking, setSpeaking] = useState(false);
  const supported = useSyncExternalStore(
    subscribeToSpeechSupport,
    getSpeechSupport,
    getServerSpeechSupport,
  );

  useEffect(() => {
    const stop = () => setSpeaking(false);
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const toggleSpeech = () => {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      className={`voice-response-button ${speaking ? "voice-response-active" : ""}`}
      type="button"
      aria-label={speaking ? "Stop speaking" : "Read response aloud"}
      title={speaking ? "Stop speaking" : "Read response aloud"}
      onClick={toggleSpeech}
      disabled={!text.trim() || !supported}
    >
      {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}
