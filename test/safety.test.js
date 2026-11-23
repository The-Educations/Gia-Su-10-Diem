import test from "node:test";
import assert from "node:assert/strict";
import { scanChatText } from "../server/trust-safety.js";

test("chat contact detector: phones, spelled digits, email, zalo, links", () => {
  for (const [text, hit] of [
    ["Gọi cho cô 0901234567 nhé", true],
    ["Số em 0901.234.567", true],
    ["+84 912 345 678", true],
    ["zalo: 0901234567", true],
    ["Liên hệ Zalo ngoài", true],
    ["fb.me/abcxyz", true],
    ["mail tới ten@example.com", true],
    ["số không chín không một hai ba bốn năm sáu", true],
    ["Em gặp cô lúc 7h tối nhé", false],
    ["Địa chỉ trường em là 10 đường", false],
    ["học 5 buổi 900 nghìn", false],
  ]) {
    const r = scanChatText(text);
    assert.equal(r.flagged, hit, text);
    if (hit) assert.ok(!r.masked.includes("0901234567") && !r.masked.includes("0901.234.567"), text);
  }
});

test("masked body hides contact detail for the recipient", () => {
  const r = scanChatText("Sđt em 0901 234 567, zalo cùng số");
  assert.ok(r.flagged);
  assert.ok(r.masked.includes("[đã ẩn"), r.masked);
});
