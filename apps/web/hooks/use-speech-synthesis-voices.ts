"use client";

import { useEffect, useState } from "react";

/**
 * Browsers (especially WebKit) may populate `getVoices()` only after a `voiceschanged` event.
 */
export function useSpeechSynthesisVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const read = () => {
      setVoices([...synth.getVoices()]);
    };
    read();
    synth.addEventListener("voiceschanged", read);
    return () => synth.removeEventListener("voiceschanged", read);
  }, []);

  return voices;
}
