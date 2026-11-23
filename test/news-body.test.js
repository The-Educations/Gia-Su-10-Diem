import test from "node:test";
import assert from "node:assert/strict";
import { parseNewsBody } from "../app/src/lib/news-body.ts";

const IMG = "![Mô tả ảnh](https://images2.thanhnien.vn/a.jpg)";

test("parseNewsBody tách ảnh ở đầu bài, lấy chú thích từ dòng Ảnh: và giữ nguyên chữ còn lại", () => {
  const parts = parseNewsBody(`${IMG}\nẢnh: Thanh Niên\n\nĐoạn một.\n\nĐoạn hai.`);
  assert.deepEqual(parts, [
    { kind: "image", url: "https://images2.thanhnien.vn/a.jpg", alt: "Mô tả ảnh", credit: "Thanh Niên" },
    { kind: "text", text: "Đoạn một.\n\nĐoạn hai." },
  ]);
});

test("parseNewsBody không có ảnh thì trả nguyên văn một khối chữ", () => {
  assert.deepEqual(parseNewsBody("Chỉ có chữ.\n\nHai đoạn."), [{ kind: "text", text: "Chỉ có chữ.\n\nHai đoạn." }]);
  assert.deepEqual(parseNewsBody(""), []);
});

test("parseNewsBody chấp nhận ảnh không có dòng Ảnh: và nhiều ảnh giữa bài", () => {
  const parts = parseNewsBody(`Mở đầu.\n${IMG}\nTiếp theo.\n${IMG}`);
  assert.deepEqual(parts.map((p) => p.kind), ["text", "image", "text", "image"]);
  assert.equal(parts[1].credit, "");
});

test("parseNewsBody chỉ dựng ảnh từ https, còn lại giữ làm chữ thường", () => {
  for (const bad of ["![x](http://a.example/a.jpg)", "![x](javascript:alert(1))", "![x](data:image/png;base64,AAAA)"]) {
    const parts = parseNewsBody(bad);
    assert.deepEqual(parts, [{ kind: "text", text: bad }], bad);
  }
});
