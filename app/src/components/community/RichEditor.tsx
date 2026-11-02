import { useId, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
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
}: {
  id: string;
  initial: string;
  change: (html: string, text: string) => void;
  uploading: (value: boolean) => void;
  invalid: boolean;
  errorId?: string;
}) {
  const controls = useId();
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
                /^\/api\/community\/images\/[a-f0-9-]{36}$/.test(
                  element.getAttribute("src") || "",
                )
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
  const tools = [
    {
      title: "In đậm",
      icon: Bold,
      active: state.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      title: "In nghiêng",
      icon: Italic,
      active: state.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      title: "Gạch chân",
      icon: Underline,
      active: state.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      title: "Tiêu đề phụ",
      icon: Heading2,
      active: state.heading,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: "Danh sách",
      icon: List,
      active: state.bullet,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Danh sách đánh số",
      icon: ListOrdered,
      active: state.ordered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "Trích dẫn",
      icon: Quote,
      active: state.quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];
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
        {tools.map(({ title, icon: Icon, active, run }) => (
          <Button
            key={title}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon"
            aria-label={title}
            title={title}
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
                  const response = await fetch("/api/community/images", {
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
    </div>
  );
}
