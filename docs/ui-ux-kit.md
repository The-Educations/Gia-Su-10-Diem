# UI/UX kit

Design rules, tokens, per-component do/don't and shadcn+Tailwind component proposals live in https://github.com/The-Educations/UI-UX-GIASU10DIEM (clone it next to this repo). Before writing UI:

- Read its `CLAUDE.md`, `guidelines/design-rules.md` and `tokens/theme.css`, plus `guidelines/components/<group>.md` for the component you touch.
- Reuse a component from `kit/src/components/ui/<name>.tsx` there: copy it to `app/src/components/ui/`, keep `data-slot` and token classes, wrap strings in `t("…")`. Files with the same name already here were copied from this repo, so diff before overwriting.
- To fix what the owner rated, take the exported rating JSON/CSV (made on the kit's rating page) and follow its `brief`: each row names the `web_file` to edit and the `kit_file` to keep in sync.
