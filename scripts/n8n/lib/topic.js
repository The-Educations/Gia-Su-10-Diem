// Lọc chủ đề: chỉ giữ tin về tuyển sinh, thi cử, chính sách, học tập và chọn ngành.
// Hàm TỰ ĐỨNG MỘT MÌNH (không import, không dùng biến ngoài): mã của nó được nhúng
// thẳng vào ô Code của n8n bằng fn.toString(). Bước này rẻ, chạy trước khi tốn lượt Claude;
// Claude vẫn là cửa kiểm cuối (xem buildPrompt).

export function isOnTopic(item) {
  // Thanh Niên trả tiêu đề còn nguyên thực thể HTML (&aacute;...), nên giải mã trước khi so.
  const named = {
    amp: "&", quot: '"', lt: "<", gt: ">", nbsp: " ", apos: "'",
    aacute: "á", agrave: "à", acirc: "â", atilde: "ã", eacute: "é", egrave: "è", ecirc: "ê",
    iacute: "í", igrave: "ì", oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ",
    uacute: "ú", ugrave: "ù", yacute: "ý",
  };
  const decode = (s) =>
    String(s || "")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
  // Bỏ dấu để từ khoá viết một lần, khớp cả khi tiêu đề dùng dấu khác nhau.
  const flat = (s) =>
    decode(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d");

  const title = flat(item.title);
  const text = title + " " + flat(item.summary);

  // Loại ngay khi có trong TIÊU ĐỀ: tin tri ân, quà tặng, chuyện người thầy (xúc động nhưng
  // không giúp học sinh/phụ huynh quyết định gì). Ngày 20/11 có thể xuất hiện trong phần
  // tóm tắt của tin tuyển sinh (hạn đăng ký) nên chỉ xét ở tiêu đề.
  const blockTitle = /\b(?:20\/11|ngay nha giao|nha giao|tri an|qua tang|boc tham|chuc mung|loi chuc|thay co|co giao|thay giao|ky niem|ngay hoi)\b/;
  // Loại khi có ở tiêu đề hoặc tóm tắt: sự cố, vụ việc, thời sự và tin ngoài giáo dục.
  const blockAny =
    /\b(?:bao luc|danh nhau|danh hoi dong|xam hai|tu vong|bat tinh|tai nan|duoi nuoc|ngo doc|tu tu|bi bat|khoi to|truy to|tam giam|ky luat|canh cao|bi chem|gia vang|thoi tiet|bong da|bong ro|u17|u23|world cup|clip|hot girl|nuoc nao|ho nhieu nhat|dong ho|hoang tu|ty phu|ti phu|gian lan|to giac|bao che|vi pham|sai pham|thanh tra|lua dao|tranh cai|buc xuc|phan no|scandal|bi phat|dinh chi|bi dieu tra|vu an|danh bac|ma tuy)\b/;
  if (blockTitle.test(title) || blockAny.test(text)) return false;

  // Phải chạm ít nhất một chủ đề cần: tuyển sinh/thi cử, chính sách, học tập, chọn ngành.
  const allow =
    /tuyen sinh|xet tuyen|tuyen thang|du tuyen|diem chuan|diem san|diem cong|diem thi|tot nghiep|ky thi|thi thpt|thi vao|vao lop|lop 1\b|lop 6|lop 9|lop 10|lop 12|thi danh gia|danh gia nang luc|danh gia tu duy|hoc ba|chuong trinh|sach giao khoa|quy che|quy dinh|thong tu|nghi dinh|du thao|de xuat|chinh sach|hoc phi|mien giam|hoc bong|tro cap|ho tro hoc|day them|hoc them|ielts|toefl|chung chi|ngoai ngu|du hoc|chon nganh|nganh hoc|dai hoc|cao dang|hoc sinh|phu huynh|sinh vien|nhan luc|viec lam|huong nghiep|phuong phap|on thi|de thi|mon thi|hoc tap|tu hoc|chuan dau ra|bo gd|bo giao duc|mon hoc|to hop mon|nghien cuu|khoa hoc|cong bo|sang che|giai thuong|giai nhat|huy chuong|olympic|thanh tich|xep hang|robot|tri tue nhan tao|cong nghe|chuyen doi so|hop tac dao tao|dao tao|thac si|tien si|nganh/;
  return allow.test(text);
}
