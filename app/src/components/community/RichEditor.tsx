import { useId, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ErrorState } from "@/components/common";

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
    [error, setError] = useState("");
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
          title="Chèn liên kết"
          aria-expanded={panel === "link"}
          onClick={() => {
            setPanel(panel === "link" ? null : "link");
            setUrl(editor.getAttributes("link").href || "");
            setLabel(
              editor.state.doc.textBetween(
                editor.state.selection.from,
                editor.state.selection.to,
              ),
            );
            setError("");
          }}
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
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setError("Ảnh tối đa 5 MB.");
                  return;
                }
                let count = 0;
                editor.state.doc.descendants((node) => {
                  if (node.type.name === "image") count++;
                });
                if (count >= 5) {
                  setError("Mỗi bài tối đa 5 ảnh.");
                  return;
                }
                setBusy(true);
                uploading(true);
                setError("");
                try {
                  const response = await fetch(imageUploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": file.type },
                    body: file,
                  });
                  const data = await response.json();
                  if (!response.ok)
                    throw new Error(data.error || "Không thể tải ảnh.");
                  editor
                    .chain()
                    .focus()
                    .setImage({
                      src: data.url,
                      alt: alt.trim() || file.name.replace(/\.[^.]+$/, ""),
                    })
                    .run();
                  setPanel(null);
                  setAlt("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                  uploading(false);
                }
              }}
            />
          </Field>
          {busy && <span role="status">Đang tải ảnh…</span>}
        </div>
      )}
      {error && <ErrorState error={error} />}
      <EditorContent editor={editor} />
      <footer className="community-editor-foot" aria-live="polite">
        <span>{state.words} chữ · {Math.max(1, Math.round(state.words / 200))} phút đọc</span>
        <span className="community-editor-hint">Gõ ## để tạo tiêu đề, - để tạo danh sách, &gt; để trích dẫn</span>
      </footer>
    </div>
  );
}
