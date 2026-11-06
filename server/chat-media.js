import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";

export const MEDIA_LIMIT = 8 * 1024 * 1024;
const threads = { inquiry: ["inquiries", "inquiry_messages", "inquiry_id"], lesson: ["bookings", "messages", "booking_id"], support: ["support_threads", "support_messages", "thread_id"] };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const chatMessageSchema = z.object({ body: z.string().trim().max(3000).default(""), attachment_id: z.string().uuid().optional() }).refine(d => d.body || d.attachment_id, { message: "Nhập tin nhắn hoặc chọn ảnh, âm thanh, tài liệu." });

function participant(db, user, kind, id, write = false) {
  const config = threads[kind];
  const thread = config && one(db, `SELECT * FROM ${config[0]} WHERE id=?`, id);
  const allowed = thread && (kind === "support" ? user.role === "admin" || thread.user_id === user.id : [thread.student_id, thread.tutor_id].includes(user.id) || (!write && kind === "lesson" && user.role === "admin"));
  if (!allowed) fail(404, "Không tìm thấy cuộc trò chuyện.");
  if (write) {
    const recipient = kind === "support" ? thread.user_id : user.id === thread.student_id ? thread.tutor_id : thread.student_id;
    if (!one(db, "SELECT id FROM users WHERE id=? AND status='active'", recipient)) fail(409, "Tài khoản nhận hiện không hoạt động.");
  }
}
const metadata = row => ({ id: row.id, kind: row.kind, size: row.size, ...(row.kind === "file" && { name: row.name }), url: `/api/chat/attachments/${row.id}` });
export function withChatMedia(db, kind, threadId, messages) {
  const attachments = new Map(all(db, "SELECT id,kind,size,name,message_id FROM chat_attachments WHERE thread_kind=? AND thread_id=? AND message_id IS NOT NULL", kind, threadId).map(row => [row.message_id, metadata(row)]));
  return messages.map(message => ({ ...message, attachment: attachments.get(message.id) || null }));
}
export function insertChatMessage(db, kind, threadId, user, input, context = null) {
  return transaction(db, () => {
    participant(db, user, kind, threadId, true);
    const { body, attachment_id } = chatMessageSchema.parse(input);
    if (attachment_id && !one(db, "SELECT id FROM chat_attachments WHERE id=? AND owner_id=? AND thread_kind=? AND thread_id=? AND message_id IS NULL", attachment_id, user.id, kind, threadId)) fail(400, "Tệp không thuộc cuộc trò chuyện này hoặc đã được gửi.");
    const [, table, column] = threads[kind];
    const result = kind === "inquiry"
      ? run(db, `INSERT INTO ${table}(${column},sender_id,body,context_kind,context_id) VALUES (?,?,?,?,?)`, threadId, user.id, body, context?.kind || null, context?.id || null)
      : run(db, `INSERT INTO ${table}(${column},sender_id,body) VALUES (?,?,?)`, threadId, user.id, body);
    const id = Number(result.lastInsertRowid);
    if (attachment_id) run(db, "UPDATE chat_attachments SET message_id=? WHERE id=?", id, attachment_id);
    return id;
  });
}
function audioMime(data, claimed) {
  const ascii = (start, end) => data.subarray(start, end).toString("ascii");
  if (claimed === "audio/webm" && data.subarray(0,4).toString("hex") === "1a45dfa3") return claimed;
  if (claimed === "audio/ogg" && ascii(0,4) === "OggS") return claimed;
  if (["audio/mp4", "audio/x-m4a"].includes(claimed) && ascii(4,8) === "ftyp") return "audio/mp4";
  if (["audio/wav", "audio/x-wav"].includes(claimed) && ascii(0,4) === "RIFF" && ascii(8,12) === "WAVE") return "audio/wav";
  if (claimed === "audio/mpeg" && (ascii(0,3) === "ID3" || (data[0] === 255 && (data[1] & 224) === 224))) return claimed;
  fail(400, "Âm thanh không hợp lệ. Dùng MP3, M4A, WAV, OGG hoặc WebM.");
}
// Documents are stored and downloaded as-is, never rendered by the browser, so
// each type is accepted only when its first bytes match what it claims to be.
const ole = data => data.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
const zipped = folder => data => data.subarray(0, 4).toString("hex") === "504b0304" && data.includes(folder);
const plainText = data => !data.subarray(0, 8000).includes(0);
const DOCUMENTS = {
  "application/pdf": { ext: "pdf", check: data => data.subarray(0, 1024).includes("%PDF-") },
  "application/msword": { ext: "doc", check: ole },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", check: zipped("word/") },
  "application/vnd.ms-excel": { ext: "xls", check: ole },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", check: zipped("xl/") },
  "application/vnd.ms-powerpoint": { ext: "ppt", check: ole },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", check: zipped("ppt/") },
  "text/plain": { ext: "txt", check: plainText },
  "text/csv": { ext: "csv", check: plainText },
};
function documentMime(data, claimed, name) {
  // Some systems send no type or a generic one; fall back to the file extension.
  const ext = name.split(".").pop().toLowerCase();
  const type = DOCUMENTS[claimed] ? claimed : Object.keys(DOCUMENTS).find(mime => DOCUMENTS[mime].ext === ext && (!claimed || claimed === "application/octet-stream"));
  if (!type) fail(400, "Định dạng chưa được hỗ trợ. Dùng ảnh, âm thanh hoặc tài liệu PDF, Word, Excel, PowerPoint, TXT, CSV.");
  if (!DOCUMENTS[type].check(data)) fail(400, "Nội dung tệp không khớp với định dạng. Hãy kiểm tra lại tệp.");
  return type;
}
function fileName(header) {
  let name = "";
  try { name = decodeURIComponent(header || ""); } catch { /* use the fallback below */ }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
  if (name.length > 120) { const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).slice(0, 10) : ""; name = name.slice(0, 110 - ext.length) + ext; }
  return name || "Tệp đính kèm";
}
export function registerChatMedia(app, db, auth, processPhoto) {
  app.post("/api/chat/:kind/:id/attachments", auth(), express.raw({ type: () => true, limit: MEDIA_LIMIT }), async (req, res) => {
    const kind = z.enum(["inquiry", "lesson", "support"]).parse(req.params.kind);
    const threadId = z.coerce.number().int().positive().parse(req.params.id);
    participant(db, req.user, kind, threadId, true);
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, "Chọn một tệp để gửi.");
    let data = req.body, mime = req.get("Content-Type")?.split(";")[0].toLowerCase() || "";
    const name = fileName(req.get("X-File-Name"));
    const image = ["image/jpeg", "image/png", "image/webp"].includes(mime);
    const audio = mime.startsWith("audio/");
    let attachmentKind = "image";
    if (image) {
      try { data = await processPhoto(data, true); mime = "image/webp"; }
      catch { fail(400, "Ảnh không hợp lệ. Dùng JPG, PNG hoặc WebP."); }
    } else if (audio) { mime = audioMime(data, mime); attachmentKind = "audio"; }
    else { mime = documentMime(data, mime, name); attachmentKind = "file"; }
    if (data.length > MEDIA_LIMIT) fail(413, "Tệp tối đa 8 MB.");
    const id = randomUUID();
    transaction(db, () => {
      if (!one(db, "SELECT id FROM users WHERE id=? AND status='active'", req.user.id)) fail(403, "Tài khoản hiện không hoạt động.");
      participant(db, req.user, kind, threadId, true);
      run(db, "DELETE FROM chat_attachments WHERE message_id IS NULL AND created_at < datetime('now','-1 day')");
      if (one(db, "SELECT COUNT(*) AS n FROM chat_attachments WHERE owner_id=? AND message_id IS NULL", req.user.id).n >= 10) fail(429, "Có quá nhiều tệp chưa gửi. Hãy gửi hoặc bỏ tệp trước khi tải thêm.");
      run(db, "INSERT INTO chat_attachments(id,thread_kind,thread_id,owner_id,kind,mime,size,name) VALUES (?,?,?,?,?,?,?,?)", id, kind, threadId, req.user.id, attachmentKind, mime, data.length, attachmentKind === "file" ? name : "");
      for (let offset=0, part=0; offset<data.length; offset+=100000, part++) run(db, "INSERT INTO chat_attachment_chunks VALUES (?,?,?)", id, part, data.subarray(offset, offset+100000));
    });
    res.status(201).json(metadata({ id, kind: attachmentKind, size: data.length, name }));
  });
  app.delete("/api/chat/attachments/:id", auth(), (req, res) => {
    run(db, "DELETE FROM chat_attachments WHERE id=? AND owner_id=? AND message_id IS NULL", req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.get("/api/chat/attachments/:id", auth(), (req, res) => {
    const row = one(db, "SELECT * FROM chat_attachments WHERE id=?", req.params.id);
    if (!row || (!row.message_id && row.owner_id !== req.user.id)) fail(404, "Tệp không có sẵn.");
    participant(db, req.user, row.thread_kind, row.thread_id);
    const data = Buffer.concat(all(db, "SELECT data FROM chat_attachment_chunks WHERE attachment_id=? ORDER BY part", row.id).map(c => Buffer.from(c.data)));
    res.set("Content-Type", row.mime).set("Content-Security-Policy", "default-src 'none'; sandbox").set("Accept-Ranges", "bytes")
      .set("Content-Disposition", row.kind === "file" ? `attachment; filename="${row.name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(row.name)}` : "inline");
    const range = req.get("Range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : -1, end = match?.[2] ? Math.min(Number(match[2]), data.length-1) : data.length-1;
      if (start < 0 || start >= data.length || end < start) return res.status(416).set("Content-Range", `bytes */${data.length}`).end();
      return res.status(206).set("Content-Range", `bytes ${start}-${end}/${data.length}`).send(data.subarray(start,end+1));
    }
    res.send(data);
  });
}
