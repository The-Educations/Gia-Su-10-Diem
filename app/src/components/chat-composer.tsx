import { useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatAttachment } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ErrorState } from "./common";

const limit = 8 * 1024 * 1024;
export function ChatComposer({ uploadPath, ready, onSend }: {
  uploadPath: string; ready: boolean; onSend: (body: string, attachmentId?: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null), audioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploaded = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  const upload = useRef<AbortController | null>(null);
  function releaseMic() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      upload.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      releaseMic();
      if (uploaded.current) void api(`/chat/attachments/${uploaded.current}`, "DELETE").catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function chooseFile(next: File | null) {
    if (next && (!next.size || next.size > limit)) { setError("Chọn tệp có dung lượng tối đa 8 MB."); return; }
    if (uploaded.current) void api(`/chat/attachments/${uploaded.current}`, "DELETE").catch(() => {});
    uploaded.current = undefined;
    setFile(next); setError("");
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Trình duyệt chưa hỗ trợ ghi âm. Bạn có thể đính kèm file âm thanh."); return;
    }
    setError(""); setRequestingMic(true);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic;
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(value => MediaRecorder.isTypeSupported(value));
      const rec = new MediaRecorder(mic, type ? { mimeType: type } : undefined);
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      rec.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > limit && rec.state === "recording") rec.stop(); } };
      rec.onstop = () => {
        releaseMic();
        if (!alive.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType });
        chooseFile(new File([blob], "Tin nhắn thoại", { type: blob.type }));
      };
      rec.onerror = () => { releaseMic(); if (alive.current) { setRecording(false); setError("Không ghi âm được. Hãy thử lại hoặc đính kèm file."); } };
      rec.start(1000); setRecording(true); setSeconds(0);
      const started = Date.now();
      timer.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - started) / 1000));
        if (Date.now() - started >= 120000 && rec.state === "recording") rec.stop();
      }, 1000);
    } catch { releaseMic(); if (alive.current) setError("Chưa truy cập được micro. Cho phép micro trong trình duyệt hoặc đính kèm file âm thanh."); }
    finally { if (alive.current) setRequestingMic(false); }
  }
  async function send(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || recording || requestingMic || !ready || (!body.trim() && !file)) return;
    setBusy(true); setError("");
    try {
      if (file && !uploaded.current) {
        upload.current = new AbortController();
        const response = await fetch(`/api${uploadPath}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file, signal: upload.current.signal });
        const result = await response.json() as ChatAttachment & { error?: string };
        if (!response.ok) throw new Error(result.error || "Không tải được tệp.");
        uploaded.current = result.id;
      }
      if (!alive.current) return;
      await onSend(body, uploaded.current);
      uploaded.current = undefined;
      if (alive.current) { setBody(""); setFile(null); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <form className="message-composer" onSubmit={send}>
    {error && <ErrorState error={error} />}
    {file && <div className="chat-attachment-preview">
      {file.type.startsWith("image/") ? <img src={preview} alt="Ảnh sắp gửi" /> : <audio src={preview} controls preload="metadata" aria-label="Nghe lại âm thanh trước khi gửi" />}
      <span>{file.name}</span><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="Bỏ tệp đính kèm" onClick={() => chooseFile(null)}><X /></Button>
    </div>}
    <label className="sr-only" htmlFor="message">Tin nhắn</label>
    <Textarea id="message" placeholder="Nhập tin nhắn…" value={body} maxLength={3000} disabled={busy} onChange={event => setBody(event.target.value)} onKeyDown={event => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault(); event.currentTarget.form?.requestSubmit();
      }
    }} />
    <div className="chat-composer-actions">
      <div>
        <input ref={imageInput} className="sr-only" tabIndex={-1} type="file" disabled={busy || recording || requestingMic} accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh gửi" onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} />
        <input ref={audioInput} className="sr-only" tabIndex={-1} type="file" disabled={busy || recording || requestingMic} accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm" aria-label="Chọn âm thanh gửi" onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} />
        <Button type="button" variant="ghost" size="icon" aria-label="Gửi ảnh" title="Gửi ảnh" disabled={busy || recording || requestingMic} onClick={() => imageInput.current?.click()}><ImagePlus /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Đính kèm âm thanh" title="Đính kèm âm thanh" disabled={busy || recording || requestingMic} onClick={() => audioInput.current?.click()}><Paperclip /></Button>
        <Button type="button" variant={recording ? "destructive" : "ghost"} size="icon" aria-label={recording ? "Dừng ghi âm" : "Ghi âm"} title={recording ? "Dừng ghi âm" : "Ghi âm tối đa 2 phút"} disabled={busy || requestingMic || !!file} onClick={() => recording ? recorder.current?.stop() : void startRecording()}>{recording ? <Square /> : <Mic />}</Button>
        {requestingMic && <span role="status">Đang mở micro…</span>}
        {recording && <span role="status">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2,"0")}</span>}
      </div>
      <Button type="submit" disabled={busy || !ready || recording || requestingMic || (!body.trim() && !file)}><Send />{busy ? "Đang gửi…" : "Gửi"}</Button>
    </div>
  </form>;
}
