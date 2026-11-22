# Video quảng cáo The Educations trong dải chạy

Bản thảo gồm hai phần:

- **Phần 1 — Bối cảnh, thiết kế và logic:** để model tạo video hiểu video này nằm ở đâu, nói gì, trông thế nào và chuyển động ra sao.
- **Phần 2 — Prompt render:** khối prompt gửi thẳng cho model tạo video.

Trạng thái: **chỉ là bản thảo, chưa có video, chưa sửa code.**

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Chủ dự án đã quyết. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Claude đề xuất, chủ dự án duyệt hoặc đổi. |
| **[CẦN CHỐT]** | Điểm còn mở, kèm giá trị mặc định đang dùng trong bản này. |

---

# PHẦN 1 — BỐI CẢNH, THIẾT KẾ VÀ LOGIC

## 1. Video này là gì

**The Educations** là tên tổ chức (Organization). Khẩu hiệu của tổ chức: **"Làm Giáo Dục, vì Giáo Dục"**, bản tiếng Anh **"Make EDU, for EDU"**. Dự án đầu tiên và hiện là duy nhất của tổ chức là **Gia Sư 10 Điểm**, một nền tảng kết nối gia sư với học sinh và phụ huynh.

Video này là **một đoạn nhận diện thương hiệu ngắn, khoảng 8 giây**, giống màn logo NVIDIA "The way it's meant to be played" hiện lên trước khi vào game: logo bên trái, khẩu hiệu hai dòng bên phải [CHỐT]. Nó không kể chuyện, không giới thiệu tính năng, không có người, không có cảnh vật. Chỉ có logo và khẩu hiệu.

Video giới thiệu dài 30–40 giây về hệ thống (con trỏ chuột đi qua từng mục của Gia Sư 10 Điểm) là **một video khác**, dành cho trang giới thiệu, không thuộc bản này [CHỐT].

## 2. Video được chiếu ở đâu

Video chạy bên trong **thanh trên cùng** của trang làm việc trên web Gia Sư 10 Điểm, tại chỗ đang có **dải chạy bài đăng** ("Đang tìm gia sư" với tài khoản gia sư, "Gia sư đang tìm học sinh" với tài khoản học sinh, phụ huynh). Dải chạy nằm giữa chữ tên trang (ví dụ "Tổng quan") ở bên trái và nút chọn ngôn ngữ VI/EN ở bên phải.

Logic hiển thị trên web [CHỐT]:

1. Dải chạy bài đăng chạy như bình thường.
2. Đến lượt quảng cáo, dải bài đăng ẩn đi, video phát đúng ở chỗ đó. Tên trang bên trái và nút VI/EN bên phải vẫn đứng yên.
3. Video phát hết, dải bài đăng hiện lại và chạy tiếp.
4. Bấm vào video **không có gì xảy ra**: không mở trang nào, không phóng to, không có nút.

Nhịp chiếu [ĐỀ XUẤT]: quảng cáo chỉ chen vào khi bài đăng đang chạy đã trôi hết khỏi khung (không cắt ngang chữ), và đã qua khoảng 45 giây kể từ lần chiếu trước. Phần nhịp chiếu và chuyển cảnh giữa dải bài đăng với video do web xử lý, **không nằm trong video**.

## 3. Kích thước và khung hình — điều quan trọng nhất

Khung chiếu trên web rất **dẹt**: cao khoảng 56px trong thanh trên cùng cao 80px, rộng từ khoảng 500px đến 900px tùy màn hình. Tỉ lệ khoảng **10:1**. Hầu hết model tạo video không xuất được tỉ lệ này, nên làm như sau [ĐỀ XUẤT]:

- **Render bản gốc 16:9, 1920×1080.**
- **Toàn bộ nội dung nằm trong một dải ngang ở giữa khung**, cao 200px (từ y = 440 đến y = 640). Phía trên và dưới dải đó chỉ là nền trơn, không có gì.
- Sau khi render, cắt lấy dải **1920×200** (tỉ lệ 9,6:1) để đưa lên web.
- Nền phải là **một màu trơn tuyệt đối**, không vân, không gradient, không hạt nhiễu. Nhờ vậy khi khung trên web rộng hơn video, web chỉ cần tô cùng màu ở hai bên là liền mạch.

Hệ quả cho thiết kế: logo và chữ sẽ hiện trên web ở cỡ rất nhỏ (chữ EDU cao khoảng 30px, mỗi dòng khẩu hiệu cao khoảng 14–16px). Vì vậy mọi thứ phải **to, rõ, nét đơn giản, tương phản cao**; mọi chi tiết nhỏ (bóng đổ, ánh sáng, hạt bụi, hoa văn) đều sẽ mất hoặc thành nhiễu.

## 4. Màu sắc

| Vai trò | Màu | Ghi chú |
| --- | --- | --- |
| Nền | `#852F36` đỏ đậm | Màu thương hiệu, đang dùng cho nút và thẻ trên web. [CẦN CHỐT] — phương án còn lại là nền kem `#FAF8F3` với chữ `#282820`. |
| Chữ logo và khẩu hiệu | `#FFFDFA` kem trắng | |
| Gạch ngang giữa chữ E của EDU | `#F0C987` vàng ấm | [ĐỀ XUẤT]. Trên trang giới thiệu gạch này màu đỏ `#852F36`; trên nền đỏ nó sẽ biến mất nên cần đổi màu. |

Không dùng thêm màu nào khác.

## 5. Logo "THE EDUCATIONS" — hình dáng chính xác

Logo là chữ viết hoa **THE EDUCATIONS**, vẽ bằng **nét đơn đều (monoline)**:

- Mọi nét cùng một độ dày, khoảng **19% chiều cao chữ**.
- Đầu nét và góc nối đều **bo tròn**.
- Chữ không chân, dáng hình học: chữ C, O, D, U, S là cung tròn; A là chữ V ngược có gạch ngang; N, H, T, I là các nét thẳng.
- Bên trong chữ không tô kín, chỉ có nét.
- Tổng thể là một dòng chữ rất dài, tỉ lệ khoảng **11,7:1**.

Thứ tự và cấu tạo các chữ (từ trái sang phải):

| Chữ | Cấu tạo nét | Vai trò khi thu gọn |
| --- | --- | --- |
| T | gạch ngang trên + nét dọc giữa | mờ dần |
| H | hai nét dọc + gạch ngang giữa | mờ dần |
| E | nét dọc + ba gạch ngang | mờ dần |
| *(khoảng trắng giữa hai từ)* | | |
| **E** | nét dọc + gạch trên + gạch dưới, **gạch giữa khác màu** (xem mục 4) | **giữ lại** |
| **D** | nét dọc + nửa vòng tròn bên phải | **giữ lại** |
| **U** | hai nét dọc nối bằng nửa vòng tròn ở đáy | **giữ lại** |
| C | cung tròn mở bên phải | mờ dần |
| A | chữ V ngược + gạch ngang | mờ dần |
| T | gạch ngang trên + nét dọc giữa | mờ dần |
| I | một nét dọc | mờ dần |
| O | vòng tròn kín | mờ dần |
| N | hai nét dọc + nét chéo | mờ dần |
| S | hai cung nối nhau | mờ dần |

Ba chữ **E, D, U** của từ "EDUCATIONS" chính là **EDU**, dạng thu gọn của logo. Đây là đúng hiệu ứng đang có trên trang giới thiệu khi cuộn trang xuống.

## 6. Khẩu hiệu — chữ viết tay

Hai dòng, **cả hai cùng hiện**, không đổi theo ngôn ngữ đang chọn trên web [CHỐT]:

- Dòng 1: **Làm Giáo Dục, vì Giáo Dục**
- Dòng 2: **Make EDU, for EDU**

Phải giữ đúng từng ký tự, đúng chữ hoa, đúng dấu câu, đúng mọi dấu tiếng Việt: **à** trong "Làm", **á** trong "Giáo" (hai lần), **ụ** trong "Dục" (hai lần), **ì** trong "vì". Sai một dấu là hỏng video.

Kiểu chữ [CHỐT]: **chữ viết tay nghiêng, đẹp**, như viết bằng bút máy. Các chữ trong một từ có thể nối nhau hoặc đứng rời như chữ viết tay thật. Nét có thay đổi độ dày nhẹ, không quá bay bướm, vẫn đọc rõ ở cỡ nhỏ.

Ảnh tham chiếu dùng phông **Charm Bold** [ĐỀ XUẤT]. Phông này hiển thị đúng mọi dấu tiếng Việt và vẫn đọc được ở cỡ nhỏ. Phông Snell Roundhand bị loại vì nét uốn của chữ "L" đè lên dấu huyền của chữ "à", ở cỡ nhỏ nhìn thành "Lâm". Phông Savoye LET đúng dấu nhưng nét quá mảnh, ở cỡ 14–16px trên web sẽ gần như mất. Màu kem trắng như logo. Hai dòng cùng cỡ chữ; dòng 2 có thể nhạt hơn một chút (khoảng 85% độ đậm) để dòng tiếng Việt là dòng chính [ĐỀ XUẤT].

Cách hiện [CHỐT]: **phải là hiệu ứng viết tay thật**, chữ được viết ra dần từ trái sang phải theo đầu bút đang di chuyển. Không được hiện cả dòng cùng lúc, không được hiện từng chữ bằng cách mờ dần. Dòng 1 viết xong mới đến dòng 2.

Chi tiết viết dấu [ĐỀ XUẤT]: giống người Việt viết tay, mỗi từ viết phần chữ trước, viết xong từ đó mới chấm dấu (dấu huyền, dấu sắc, dấu nặng), rồi mới sang từ tiếp theo.

## 7. Bố cục khung cuối (giống màn NVIDIA)

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│        ███████          Làm Giáo Dục, vì Giáo Dục             │
│        E D U            Make EDU, for EDU                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
          logo                 khẩu hiệu hai dòng
```

- **EDU bên trái**, khẩu hiệu hai dòng **bên phải** [CHỐT].
- Khối khẩu hiệu cao bằng chữ EDU: đầu dòng 1 ngang với đỉnh chữ EDU, chân dòng 2 ngang với đáy chữ EDU [ĐỀ XUẤT].
- Khoảng cách giữa EDU và khẩu hiệu bằng khoảng một nửa chiều cao chữ EDU [ĐỀ XUẤT].
- Cả cụm (EDU + khẩu hiệu) **nằm chính giữa khung theo chiều ngang**, chiếm khoảng 55% bề ngang khung [ĐỀ XUẤT].
- Cỡ chữ EDU không đổi từ đầu đến cuối video: EDU ở khung cuối to đúng bằng EDU khi còn nằm trong logo đầy đủ. Logo đầy đủ rộng khoảng 1500px trên khung 1920px.
- Ảnh mẫu: `docs/quang-cao-dai-chay/04-khung-cuoi.png`.
- Không có đường kẻ, khung viền hay ký hiệu nào khác.

## 8. Kịch bản từng giây

Tổng cộng **8 giây**, 30 khung hình/giây [ĐỀ XUẤT]. Mỗi bước dưới đây là một chuyển động liền mạch, không cắt cảnh, không đổi góc máy.

| Thời gian | Chuyện gì xảy ra | Ghi chú |
| --- | --- | --- |
| **0,0 – 0,3s** | Chỉ có nền đỏ trơn. | Khung đầu tiên phải là nền trơn hoàn toàn để web chuyển từ dải bài đăng sang mượt mà. |
| **0,3 – 1,6s** | Logo **THE EDUCATIONS** hiện ra **chính giữa khung**: từng nét được vẽ ra (như nét bút chạy), các chữ lần lượt từ trái sang phải, chữ sau bắt đầu trễ chữ trước một chút. | Kiểu hiện ra này là [ĐỀ XUẤT]; chủ dự án chỉ chốt "The Educations hiện ra". |
| **1,6 – 2,2s** | Giữ yên logo đầy đủ. | Đủ để người xem đọc được tên. |
| **2,2 – 2,8s** | **Thu gọn thành EDU**: các chữ T, H, E (bên trái) và C, A, T, I, O, N, S (bên phải) cùng **trượt ngang về phía giữa** và **mờ dần đến biến mất**; cùng lúc ba chữ E, D, U trượt nhẹ sang phải để **nằm chính giữa khung**. Chuyển động chậm đầu, nhanh giữa, chậm cuối. Các chữ bị mờ biến mất sớm hơn lúc chuyển động kết thúc (mờ trong khoảng nửa đầu). | [CHỐT] — đúng hiệu ứng trên trang giới thiệu. |
| **2,8 – 3,2s** | Giữ yên chữ **EDU** ở giữa. | |
| **3,2 – 3,9s** | **EDU trượt sang trái** đến vị trí cuối trong bố cục mục 7. Chậm đầu, chậm cuối. | [CHỐT] |
| **3,9 – 5,6s** | **Viết tay dòng 1** "Làm Giáo Dục, vì Giáo Dục" bên phải EDU, từ trái sang phải, dấu chấm sau mỗi từ (mục 6). | [CHỐT] |
| **5,6 – 6,9s** | **Viết tay dòng 2** "Make EDU, for EDU" ngay dưới dòng 1. | [CHỐT] |
| **6,9 – 8,0s** | Giữ yên toàn bộ khung cuối (EDU + hai dòng khẩu hiệu). Không mờ đi, không thu lại. | Web sẽ tự làm mờ video và trả lại dải bài đăng. |

## 9. Những điều không được có

Đây là các lỗi làm hỏng video dù nó vẫn "đẹp":

- Không âm thanh, không nhạc, không lồng tiếng. Web đã có nhạc nền riêng; video luôn phát tắt tiếng.
- Không chuyển động máy quay: không zoom, không lia, không xoay, không rung, không hiệu ứng 3D, không phối cảnh.
- Không hạt sáng, tia sáng, lens flare, khói, bụi, kim tuyến, phản chiếu, bóng đổ, viền phát sáng.
- Không gradient hay vân trên nền; nền một màu trơn từ đầu đến cuối.
- Không thêm chữ nào khác: không tên "Gia Sư 10 Điểm", không địa chỉ web, không phụ đề, không watermark, không ký hiệu ®.
- Không bàn tay, cây bút hay đầu bút hiện ra trong khung khi viết chữ; chỉ có nét mực tự hiện ra.
- Không đổi kiểu chữ của logo (logo là nét đơn bo tròn, không phải phông chữ thông thường).
- Không sai chính tả, không thiếu hoặc lệch dấu tiếng Việt.
- Không để nội dung tràn ra ngoài dải ngang giữa khung (mục 3).

## 10. Giới hạn cần biết khi dùng model tạo video

Model tạo video hiện nay **thường làm méo chữ**, đặc biệt là dấu tiếng Việt và chữ viết tay, và hay "sáng tạo" thêm chi tiết. Để tăng khả năng ra đúng:

1. **Đính kèm ảnh tham chiếu** nếu model cho phép. Các ảnh đã có sẵn trong thư mục `docs/quang-cao-dai-chay/`, vẽ từ đúng nét logo gốc ở `scripts/the-educations-logo.html`:

   | Ảnh | Dùng cho |
   | --- | --- |
   | `01-khung-dau-nen-tron.png` | Khung đầu (0s): nền đỏ trơn, 1920×1080 |
   | `02-logo-the-educations.png` | Logo đầy đủ ở giữa khung (1,6–2,2s) |
   | `03-edu-o-giua.png` | EDU ở giữa sau khi thu gọn (2,8–3,2s) |
   | `04-khung-cuoi.png` | Khung cuối (6,9–8s): EDU + hai dòng khẩu hiệu |
   | `05-logo-the-educations-nen-trong-suot.png` | Logo đầy đủ trên nền trong suốt, cho model cần ảnh logo riêng |
   | `06-khung-cuoi-nen-trong-suot.png` | Khung cuối trên nền trong suốt |
   | `07-khung-cuoi-dai-1920x200.png` | Dải 1920×200 cắt từ khung cuối, đúng phần sẽ lên web |

2. Nếu model hỗ trợ **khung đầu và khung cuối**, dùng `01-khung-dau-nen-tron.png` làm khung đầu và `04-khung-cuoi.png` làm khung cuối.
3. **Kiểm tra từng khung có chữ** trước khi dùng: đúng từng ký tự, đúng dấu, đúng bố cục.
4. Nếu sau vài lần thử chữ vẫn sai, phương án dự phòng là dựng video này bằng code trên web (SVG + CSS), vì logo đã có sẵn dạng nét vẽ và cách thu gọn thành EDU đã có trên trang giới thiệu.

## 11. Tệp cần giao

| Tệp | Thông số |
| --- | --- |
| Bản gốc | MP4 (H.264), 1920×1080, 30fps, 8 giây, không âm thanh |
| Bản cắt cho web | MP4 (H.264) và WebM (VP9), 1920×200, cắt từ y = 440 đến y = 640 của bản gốc, không âm thanh, mỗi tệp dưới 500KB |
| Ảnh tĩnh | PNG 1920×200 của khung cuối, dùng khi người dùng bật "giảm chuyển động" và làm ảnh chờ khi video chưa tải xong. Đã có bản dựng từ logo gốc: `07-khung-cuoi-dai-1920x200.png` |

---

# PHẦN 2 — PROMPT RENDER

Prompt viết bằng tiếng Anh vì các model tạo video hiểu tiếng Anh tốt nhất. Các đoạn chữ phải hiện trong video được giữ nguyên tiếng Việt, đặt trong ngoặc kép. Nếu model có ô **negative prompt** riêng, chép phần "Negative prompt" vào đó; nếu không, giữ nguyên phần đó ở cuối prompt chính.

## Prompt chính

```text
An 8-second flat 2D motion-graphics brand ident for an education organization called "The Educations". Style reference: the NVIDIA "The way it's meant to be played" logo screen — logo on the left, a two-line tagline on the right — but rendered as minimal, elegant vector motion graphics. 16:9, 1920x1080, 30 fps, no audio. Locked-off static camera for the entire video: no zoom, no pan, no rotation, no 3D, no perspective.

BACKGROUND: one perfectly flat solid color, deep maroon #852F36, identical in every frame. No gradient, no texture, no grain, no vignette, no light effects.

COMPOSITION: all content stays inside a thin horizontal band across the vertical middle of the frame (from y=440 to y=640, i.e. the central 200 pixels). Everything above and below that band is empty maroon background. Content is large and bold enough to stay readable when the band is later shown only 56 pixels tall.

LOGO: the wordmark "THE EDUCATIONS" in all capitals, drawn as uniform monoline strokes (stroke thickness about 19% of the letter height) with fully rounded stroke ends and rounded joins, geometric sans-serif construction, strokes only — no filled shapes. Color: warm off-white #FFFDFA. In the word "EDUCATIONS", the middle horizontal bar of the first letter E is warm gold #F0C987; every other stroke is off-white. The full wordmark is a single long line, about 11.7 times wider than it is tall.

SEQUENCE:
0.0–0.3s: Only the empty maroon background.
0.3–1.6s: The wordmark "THE EDUCATIONS" appears centered in the frame by having its strokes drawn on, like a pen tracing each line, letter by letter from left to right with a slight stagger.
1.6–2.2s: The full wordmark holds still.
2.2–2.8s: The wordmark collapses into "EDU": the letters T, H, E on the left and C, A, T, I, O, N, S on the right slide horizontally toward the center while fading out completely (they are fully invisible by about the halfway point of the move). At the same time the three letters E, D, U of "EDUCATIONS" slide slightly right so that "EDU" ends perfectly centered. Smooth ease-in-out motion.
2.8–3.2s: "EDU" holds still in the center.
3.2–3.9s: "EDU" glides smoothly to the left, ease-in-out, to its final position.
3.9–5.6s: To the right of "EDU", the first tagline line is handwritten in real time, left to right, as if by an invisible fountain pen: "Làm Giáo Dục, vì Giáo Dục". After finishing each word, the pen adds that word's Vietnamese accent marks (the grave on "à", the acute on "á", the dot below "ụ", the grave on "ì") before moving on to the next word.
5.6–6.9s: Directly below it, the second line is handwritten the same way: "Make EDU, for EDU".
6.9–8.0s: The final lockup holds completely still until the end. No fade out.

TAGLINE STYLE: elegant slanted handwriting as if written with a fountain pen, letters connecting or standing apart naturally like real handwriting, gentle thick-thin stroke variation, calm and clearly legible rather than flamboyant (match the attached final-frame reference image). Color off-white #FFFDFA; the second line slightly softer (about 85% opacity). Both lines the same size. The text must be spelled exactly, character for character, with every Vietnamese diacritic correct:
Line 1: "Làm Giáo Dục, vì Giáo Dục"
Line 2: "Make EDU, for EDU"

FINAL LOCKUP: "EDU" on the left; the two tagline lines stacked on the right. The top of line 1 aligns with the top of "EDU" and the bottom of line 2 aligns with the bottom of "EDU". The gap between "EDU" and the tagline is about half the height of "EDU". The whole lockup is horizontally centered and spans about 55% of the frame width. "EDU" keeps exactly the same size from the full wordmark to the final lockup; the full wordmark spans about 1500 of the 1920 pixels.

The handwriting appears only as ink revealing itself — no hand, no pen, no pen tip visible. No other text, logos, symbols or elements appear at any time.
```

## Negative prompt

```text
camera movement, zoom, pan, dolly, rotation, shake, 3D, perspective, depth of field, particles, sparkles, glitter, light rays, lens flare, glow, bloom, smoke, dust, reflections, drop shadows, gradient background, textured background, noise, grain, vignette, extra text, subtitles, captions, watermark, registered trademark symbol, website URL, misspelled text, missing Vietnamese diacritics, wrong accent marks, garbled letters, distorted logo, serif font for the logo, filled letters, hand, pen, pencil, pen tip, people, faces, objects, scenery, music, sound effects, voice-over, content outside the central horizontal band
```

## Ghi chú khi gửi prompt

- Nếu model chỉ cho video 5 giây, đừng nén cả kịch bản vào 5 giây: tạo hai đoạn (đoạn 1 từ 0 đến 3,9s, kết thúc ở EDU đã trượt sang trái; đoạn 2 viết hai dòng khẩu hiệu, dùng khung cuối của đoạn 1 làm khung đầu), rồi ghép lại.
- Nếu model nhận khung đầu và khung cuối: khung đầu là nền đỏ trơn, khung cuối là ảnh khung cuối ở mục 11.
- Sau khi có video, cắt dải 1920×200 ở giữa (y = 440 đến 640) rồi mới đưa lên web.
