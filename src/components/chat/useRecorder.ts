"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_MS = 10 * 60_000;

function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
    return { mime: "audio/webm;codecs=opus", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/mp4")) return { mime: "audio/mp4", ext: "m4a" }; // Safari
  return { mime: "", ext: "webm" };
}

/** Gravação com MediaRecorder (webm/opus; mp4 no Safari). README §4.3. */
export function useRecorder(
  onDone: (file: File, durationSec: number) => void,
  onError: () => void,
) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const send = useRef(false);
  const started = useRef(0);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    chunks.current = [];
    if (maxTimer.current) clearTimeout(maxTimer.current);
    setStartedAt(null);
  }, []);

  const stop = useCallback(
    (andSend: boolean) => {
      send.current = andSend;
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      else cleanup();
    },
    [cleanup],
  );

  const start = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, ext } = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      stream.current = s;
      rec.current = r;
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const dur = Math.round((Date.now() - started.current) / 1000);
        if (send.current && chunks.current.length && dur >= 1) {
          const type = r.mimeType || mime || "audio/webm";
          onDone(new File(chunks.current, `audio.${ext}`, { type }), dur);
        }
        cleanup();
      };
      r.start(250);
      started.current = Date.now();
      setStartedAt(started.current);
      setNow(started.current);
      maxTimer.current = setTimeout(() => stop(true), MAX_MS);
    } catch {
      cleanup();
      onError();
    }
  }, [cleanup, onDone, onError, stop]);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  // saiu da tela / bloqueou: descarta (DECISOES §4)
  useEffect(
    () => () => {
      send.current = false;
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return {
    recording: startedAt !== null,
    elapsedSec: startedAt ? Math.floor((now - startedAt) / 1000) : 0,
    start,
    discard: () => stop(false),
    finish: () => stop(true),
  };
}
