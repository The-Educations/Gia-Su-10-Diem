# Gia Sư 10 Điểm — Landing Page

Landing page học thuật cao cấp cho **Viện Gia Sư 10 Điểm** dựa trên ngôn ngữ thiết kế Atelier Zero.

## Tính năng

- **Typography chuẩn Tiếng Việt**: Sử dụng `Be Vietnam Pro` và `Lora` tối ưu hiển thị dấu thanh, tỷ lệ dòng và không bị lỗi font/tofu.
- **Visual Assets thực tế**: 16 bản in đồ họa ảnh thực tế với bộ lọc duotone giấy ấm (`#efe7d2`), khung định vị kỹ thuật và dải thông tin học thuật (cung cấp cả `.svg` và `.png`).
- **Interactive Visual Switcher**:
  - `✦ 3D Khối Điểm 10`: Three.js 3D Polyhedron tương tác xoay chuột/chạm.
  - `▤ Pixel Art`: Hoạt họa bảng phấn pixel art 1 kèm 1.
  - `▣ Bản In Đồ Họa`: Ảnh thực tế chất lượng cao (tự động kích hoạt khi môi trường không có WebGL).
- **Bộ lọc môn học & Form đăng ký**: Lọc nhanh các khối lớp/môn học và form đăng ký học thử 2 buổi 0 đồng.

## Cài đặt & Kiểm thử

```bash
# Kiểm tra toàn bộ tài nguyên và cấu trúc
npm test

# Build lại trang HTML từ inputs.json và styles.css
npm run build:page

# Sinh lại tài nguyên ảnh nếu cần
npm run build:assets
```
