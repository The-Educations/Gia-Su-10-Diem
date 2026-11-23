import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  Strikethrough,
  SquareCode,
  List,
  ListOrdered,
  Quote,
  Link2,
  Unlink,
  ImagePlus,
  Trash2,
  Undo,
  Redo,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ErrorState } from "@/components/common";

// Tab indents like a word processor: nests a list item, indents code, or adds a tab stop.
// Escape leaves the editor so the keyboard can move on to the next field.
const Indent = Extension.create({
  name: "tabIndent",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("listItem")) { editor.commands.sinkListItem("listItem"); return true; }
        return editor.commands.insertContent(editor.isActive("codeBlock") ? "  " : "\t");
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem")) { editor.commands.liftListItem("listItem"); return true; }
        const { $from, empty } = editor.state.selection;
        if (empty && /[\t ]$/.test($from.nodeBefore?.text || "")) editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos });
        return true;
      },
      Escape: ({ editor }) => { editor.commands.blur(); return true; },
    };
  },
});
const MAX_IMAGES = 5;

export function plainToHtml(text: string) {
  return text
    .split("\n")
    .map(
      (line) =>
        `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    )
    .join("");
}
export default function RichEditor({
  id,
  initial,
  change,
  uploading,
  invalid,
  errorId,
  imageUploadUrl = "/api/community/images",
  imageBasePath = imageUploadUrl,
}: {
  id: string;
  initial: string;
  change: (html: string, text: string) => void;
  uploading: (value: boolean) => void;
  invalid: boolean;
  errorId?: string;
  // POST target for new images, and the path (+ "/<uuid>") the saved images are served from.
  imageUploadUrl?: string;
  imageBasePath?: string;
}) {
  const controls = useId();
  const imageSrc = new RegExp(`^${imageBasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9-]{36}$`);
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [url, setUrl] = useState(""),
    [label, setLabel] = useState(""),
    [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocks, setBlocks] = useState(false),
    picker = useRef<HTMLInputElement>(null);
  // The editor's own handlers (paste, drop, Ctrl+K) are set once, so they call through refs.
  const actions = useRef({ upload: async (_file: File, _at?: number) => {}, link: () => {} });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https"],
          isAllowedUri: (url) => /^https?:\/\//i.test(url),
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow ugc",
            target: "_blank",
          },
        },
      }),
      Image.extend({
        parseHTML() {
          return [
            {
              tag: "img[src]",
              getAttrs: (element) =>
                imageSrc.test(element.getAttribute("src") || "")
                  ? null
                  : false,
            },
          ];
        },
      }).configure({ allowBase64: false }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Tiêu đề mục" : "Viết nội dung… Dòng trống có nút + để thêm tiêu đề, danh sách, ảnh"),
      }),
      Indent,
    ],
    content: initial,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": "Nội dung",
        "aria-multiline": "true",
        "aria-invalid": String(invalid),
        "aria-describedby": errorId || "",
        class: "community-rich community-editor-content",
      },
      // Paste or drop an image straight into the text.
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        void actions.current.upload(file);
        return true;
      },
      handleDrop: (view, event) => {
        const file = [...(event.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        void actions.current.upload(file, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); actions.current.link(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor }) => change(editor.getHTML(), editor.getText()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            heading: editor.isActive("heading", { level: 2 }),
            heading3: editor.isActive("heading", { level: 3 }),
            strike: editor.isActive("strike"),
            code: editor.isActive("codeBlock"),
            words: editor.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length,
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            quote: editor.isActive("blockquote"),
            link: editor.isActive("link"),
            image: editor.isActive("image"),
            undo: editor.can().undo(),
            redo: editor.can().redo(),
          }
        : null,
  });
  async function upload(file: File, at?: number) {
    if (!editor) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Dùng ảnh JPG, PNG hoặc WebP.");
    if (file.size > 5 * 1024 * 1024) return setError("Ảnh tối đa 5 MB.");
    let count = 0;
    editor.state.doc.descendants((node) => { if (node.type.name === "image") count++; });
    if (count >= MAX_IMAGES) return setError("Mỗi bài tối đa 5 ảnh.");
    setBusy(true);
    uploading(true);
    setError("");
    try {
      const response = await fetch(imageUploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tải ảnh.");
      const image = { type: "image", attrs: { src: data.url, alt: alt.trim() || file.name.replace(/\.[^.]+$/, "") } };
      if (at === undefined) editor.chain().focus().insertContent(image).run();
      else editor.chain().focus().insertContentAt(at, image).run();
      setPanel(null);
      setAlt("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      uploading(false);
    }
  }
  function openLink() {
    if (!editor) return;
    setPanel("link");
    setUrl(editor.getAttributes("link").href || "");
    setLabel(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to));
    setError("");
  }
  useEffect(() => { actions.current = { upload, link: openLink }; });
  if (!editor || !state) return null;
  // Grouped like a blog editor; each title shows its keyboard shortcut.
  const groups = [
    [
      { title: "In đậm", keys: "Ctrl+B", icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
      { title: "In nghiêng", keys: "Ctrl+I", icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
      { title: "Gạch chân", keys: "Ctrl+U", icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
      { title: "Gạch ngang", keys: "Ctrl+Shift+S", icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    ],
    [
      { title: "Tiêu đề lớn", keys: "## ", icon: Heading2, active: state.heading, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { title: "Tiêu đề nhỏ", keys: "### ", icon: Heading3, active: state.heading3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
      { title: "Trích dẫn", keys: "> ", icon: Quote, active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
      { title: "Khối mã", keys: "```", icon: SquareCode, active: state.code, run: () => editor.chain().focus().toggleCodeBlock().run() },
    ],
    [
      { title: "Danh sách", keys: "- ", icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
      { title: "Danh sách đánh số", keys: "1. ", icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
      { title: "Đường phân cách", keys: "---", icon: Minus, active: false, run: () => editor.chain().focus().setHorizontalRule().run() },
    ],
  ];
  const tools = groups.flat();
  return (
    <div
      className="community-editor"
      data-invalid={invalid}
      aria-describedby={errorId}
    >
      <div
        className="community-editor-tools"
        role="group"
        aria-label="Định dạng bài viết"
      >
        {tools.map(({ title, keys, icon: Icon, active, run }) => (
          <Button
            data-group-start={groups.some((g, gi) => gi > 0 && g[0].title === title) || undefined}
            key={title}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon"
            aria-label={title}
            title={`${title} · ${keys}`}
            aria-pressed={active}
            onClick={run}
          >
            <Icon />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Chèn liên kết"
          title="Chèn liên kết · Ctrl+K"
          aria-expanded={panel === "link"}
          onClick={() => (panel === "link" ? setPanel(null) : openLink())}
        >
          <Link2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Bỏ liên kết"
          title="Bỏ liên kết"
          disabled={!state.link}
          onClick={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
        >
          <Unlink />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Chèn ảnh"
          title="Chèn ảnh"
          disabled={busy}
          aria-expanded={panel === "image"}
          onClick={() => {
            setPanel(panel === "image" ? null : "image");
            setError("");
          }}
        >
          <ImagePlus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Xóa ảnh đã chọn"
          title="Xóa ảnh đã chọn"
          disabled={!state.image}
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          <Trash2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Hoàn tác"
          title="Hoàn tác"
          disabled={!state.undo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Làm lại"
          title="Làm lại"
          disabled={!state.redo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo />
        </Button>
      </div>
      {panel === "link" && (
        <div className="community-editor-insert">
          <Field>
            <FieldLabel htmlFor={`${controls}-url`}>
              Địa chỉ liên kết
            </FieldLabel>
            <Input
              id={`${controls}-url`}
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${controls}-label`}>Chữ hiển thị</FieldLabel>
            <Input
              id={`${controls}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Button
            type="button"
            onClick={() => {
              let href: string;
              try {
                const parsed = new URL(url.trim());
                href = parsed.href;
                if (!["https:", "http:"].includes(parsed.protocol))
                  throw new Error();
              } catch {
                setError("Nhập liên kết http:// hoặc https:// hợp lệ.");
                return;
              }
              if (editor.isActive("link"))
                editor.chain().focus().extendMarkRange("link").run();
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "text",
                  text: label || href,
                  marks: [{ type: "link", attrs: { href } }],
                })
                .run();
              setPanel(null);
              setError("");
            }}
          >
            Chèn liên kết vào bài
          </Button>
        </div>
      )}
      {panel === "image" && (
        <div className="community-editor-insert">
          <Field>
            <FieldLabel htmlFor={`${controls}-alt`}>Mô tả ảnh</FieldLabel>
            <Input
              id={`${controls}-alt`}
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${controls}-file`}>
              Chọn ảnh · JPG, PNG, WebP · tối đa 5 MB
            </FieldLabel>
            <Input
              id={`${controls}-file`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </Field>
          {busy && <span role="status">Đang tải ảnh…</span>}
        </div>
      )}
      {error && <ErrorState error={error} />}
      <BubbleMenu editor={editor} className="editor-bubble" options={{ placement: "top", offset: 8 }}
        shouldShow={({ editor: e, state: st }) => e.isEditable && !st.selection.empty && !e.isActive("codeBlock")}>
        {state.image ? (
          <>
            <input aria-label="Mô tả ảnh đã chọn" placeholder="Mô tả ảnh" defaultValue={editor.getAttributes("image").alt || ""} key={editor.getAttributes("image").src}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editor.chain().focus().updateAttributes("image", { alt: e.currentTarget.value.slice(0, 300) }).run(); } }}
              onBlur={(e) => editor.chain().updateAttributes("image", { alt: e.currentTarget.value.slice(0, 300) }).run()} />
            <button type="button" aria-label="Xóa ảnh" title="Xóa ảnh" onClick={() => editor.chain().focus().deleteSelection().run()}><Trash2 /></button>
          </>
        ) : (
          [...groups[0], groups[1][0], groups[1][1], groups[1][2]].map(({ title, icon: Icon, active, run }) => (
            <button type="button" key={title} aria-label={title} title={title} aria-pressed={active} data-active={active || undefined} onMouseDown={(e) => e.preventDefault()} onClick={run}><Icon /></button>
          )).concat(<button type="button" key="link" aria-label="Liên kết" title="Liên kết · Ctrl+K" data-active={state.link || undefined} onMouseDown={(e) => e.preventDefault()} onClick={openLink}><Link2 /></button>)
        )}
      </BubbleMenu>
      <FloatingMenu editor={editor} className="editor-blocks" options={{ placement: "left-start", offset: 8 }}>
        <button type="button" className="editor-blocks-toggle" aria-label="Thêm khối" aria-expanded={blocks} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlocks((v) => !v)}><Plus /></button>
        {blocks && (
          <span className="editor-blocks-list" role="group" aria-label="Thêm khối">
            {[groups[1][0], groups[1][1], groups[2][0], groups[2][1], groups[1][2], groups[1][3], groups[2][2]].map(({ title, icon: Icon, run }) => (
              <button type="button" key={title} aria-label={title} title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => { run(); setBlocks(false); }}><Icon /></button>
            ))}
            <button type="button" aria-label="Ảnh" title="Ảnh" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBlocks(false); picker.current?.click(); }}><ImagePlus /></button>
          </span>
        )}
      </FloatingMenu>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" hidden tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
      <EditorContent editor={editor} />
      <footer className="community-editor-foot" aria-live="polite">
        <span>{`${state.words} chữ · ${Math.max(1, Math.round(state.words / 200))} phút đọc`}</span>
        {busy && <span role="status">Đang tải ảnh…</span>}
        <span className="community-editor-hint">Tab thụt lề · Esc rời ô soạn · dán hoặc kéo ảnh vào bài</span>
      </footer>
    </div>
  );
}
