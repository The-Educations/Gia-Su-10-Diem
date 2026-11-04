# Logo The Educations — Hướng B — EDU nét liền

Đây là **một trong hai hướng** được làm song song để chọn bản đẹp hơn. Hướng còn lại nằm ở [logo-brief-a.md](logo-brief-a.md) — Hướng A, EDU với vòng thế giới. Hai file dùng chung bối cảnh, bảng màu, dấu hiệu thu gọn **EDU**, kích thước giao và cách đặt tên file để đặt cạnh nhau so sánh được. Hướng này do Claude đề xuất để so sánh với hướng A (ý của chủ dự án); có thể bỏ nếu không hợp.

Tài liệu gồm hai phần:

- **Phần 1 — Ý tưởng thiết kế:** tổ chức, mô hình hoạt động, hình logo và animation của hướng này.
- **Phần 2 — Prompt thiết kế:** một khối prompt để gửi thẳng cho một phiên Claude Design.

Trạng thái: **chỉ là ý tưởng và brief, chưa có file logo nào được tạo, chưa sửa code.** Mô tả animation của Anthropic dựa trên lời mô tả của chủ dự án và ảnh chụp wordmark "ANTHROP\C"; chưa được đối chiếu lại với trang thật của họ.

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Chủ dự án đã nêu rõ trong yêu cầu. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Hướng do Claude đề xuất để chủ dự án duyệt hoặc đổi. |
| **[CẦN CHỐT]** | Điểm còn mở, kèm đề xuất mặc định. |

---

# PHẦN 1 — Ý TƯỞNG THIẾT KẾ LOGO (EDU nét liền)

## 1. Tổ chức và mô hình hoạt động (logo phải phản ánh những điều này)

**The Educations** là tổ chức đứng sau hệ thống **Gia Sư 10 Điểm** (`giasudiem10.online`). Tên số nhiều "Educations" nên hiểu là một tổ chức có thể mở rộng thêm nhiều sản phẩm giáo dục sau này, không gắn chặt với riêng sản phẩm gia sư.

Sản phẩm hiện tại là **website tìm gia sư tại Việt Nam**:

- **Ba nhóm người dùng:** học sinh / phụ huynh, gia sư, quản trị viên. Ngoài ra có khách xem công khai.
- **Luồng chính:** chọn môn / mục tiêu kỳ thi → tìm gia sư → xem hồ sơ và giờ trống → gửi yêu cầu → gia sư xác nhận → hai bên trao đổi → học → đánh giá.
- **Tin cậy là cốt lõi:** hồ sơ gia sư đều được quản trị viên duyệt trước khi công bố; đánh giá chỉ đến từ buổi học thật; có mục Cộng đồng được kiểm duyệt.
- **Phạm vi rõ ràng [CHỐT]:** chỉ làm việc **tìm gia sư**. Không làm quiz, đáp án, chấm điểm. Logo không nên gợi hình ảnh bài thi, bút chấm hay đáp án.
- **Chi phí:** học sinh không trả phí cho nền tảng; học phí đi thẳng từ học sinh sang gia sư. (Cơ chế thu phí gia sư là thông tin nội bộ, chưa công khai, không đưa vào logo hay prompt.)

**Giọng thương hiệu hiện có:** nền giấy ấm, đỏ sẫm, chữ Be Vietnam Pro và Lora, chuyển động nhẹ, chính xác; giao diện đã có quy tắc "chữ sắc nét, không blur, không nghiêng" ([ui-motion.md](ui-motion.md)). Icon hiện tại (`assets/brand-icon-20261031.svg`) là chữ "1" và "0" nét tròn màu kem trên nền đỏ sẫm bo góc, nét `stroke-linecap: round`.

| Token | Giá trị | Dùng cho logo |
| --- | --- | --- |
| Đỏ sẫm (primary) | `#852f36` | Màu thương hiệu chính |
| Nền giấy | `#faf8f3` | Nền sáng |
| Mực | `#282820` | Chữ, wordmark |
| Kem | `#fffdfa` | Nét sáng trên nền đỏ |

## 2. Từ mô hình suy ra thông điệp logo

Bốn ý cần "đọc" được từ logo, theo thứ tự quan trọng:

1. **Đây là giáo dục** (lĩnh vực): dấu hiệu thu gọn là **EDU**.
2. **Vươn ra, kết nối:** học sinh, phụ huynh và gia sư gặp nhau trên một nền tảng; tổ chức có thể mở rộng. Hình ảnh: một **vòng thế giới** hoặc một **nét bút vươn lên** hướng **2 giờ** (phía trên bên phải).
3. **Ấm, chính xác, tử tế** như giấy và mực, không phô trương, không "công nghệ lạnh".
4. **Có cá tính riêng**, nhận ra ngay cả khi chỉ còn hình nhỏ.

## 3. Hướng thiết kế này [ĐỀ XUẤT: làm song song với hướng còn lại]

Hướng B: dấu hiệu thu gọn **EDU viết bằng một nét liền** như một nét bút, kết thúc vút lên hướng **2 giờ**. Hướng này do Claude đề xuất để so sánh với hướng A (vòng thế giới, ý của chủ dự án); nếu không hợp có thể bỏ.

### 3.0 Bài học từ wordmark của Anthropic [CHỐT]

Điều cần học là **cách nghĩ**, không phải hình dáng:

1. **Dấu hiệu thu gọn mang nghĩa lĩnh vực.** "A\" đọc ra "AI". Của chúng ta phải đọc ra **giáo dục**: giữ lại **EDU** (ba chữ đầu của EDUCATIONS, cũng là cách viết tắt quen thuộc của giáo dục như đuôi `.edu`).
2. **Wordmark có cá tính, không phải chữ sans-serif thường.** Chữ của Anthropic là chữ hoa hình học nhưng có một chi tiết riêng làm nó nhận ra ngay. Ta cũng cần một **chi tiết đặc trưng** nằm ngay trong chữ.
3. **Chuyển động liền mạch và có nhịp.** Các chữ không biến mất cái "bụp", mà trượt, nối và gọn lại như một động tác.

**Sai lầm của bản brief trước [CHỐT: đã bỏ]:** chữ E ba thanh chỉ khác chữ E thường ở một thanh giữa đổi màu. Như vậy độ nhận diện rất yếu, hình đơn điệu, không có chất nghệ thuật, và chỉ là chữ cái đầu chứ không nói lĩnh vực. Mọi hướng dưới đây đều bỏ ý "ba thanh = ba bên".

**Tinh thần thiết kế chung [ĐỀ XUẤT]:**

- Chữ có **cảm giác nét bút mực / phấn trên giấy**: đường cong liên tục, đầu nét bo, độ dày có nhịp nhẹ (dày ở thân, mảnh dần ở chỗ chuyển) nhưng vẫn là vector sạch và đọc được ở cỡ nhỏ. Không đơn nét đều đều như icon "10" hiện có.
- **Hình học nền là đường tròn:** cung của D, U và vòng đều cùng một họ cong, có hệ tỉ lệ rõ (dựng trên một lưới tròn).
- **Ấm và uyển chuyển, không cứng như logo công nghệ:** gợi sự dẫn dắt, hành trình học, không gợi bảng điểm.
- Màu đỏ sẫm chỉ dùng cho **chi tiết đặc trưng** (không dùng để đổi màu một thanh cho có).

### 3.1 Mô tả hướng B

- **Dấu hiệu thu gọn: EDU.** Ba chữ vẽ cùng một họ cong, **nối với nhau bằng một nét liền**: chân chữ E chảy sang thân chữ D, bụng chữ D chảy sang đáy chữ U, và nét cuối của U **vút lên cao sang phải**, kết thúc ở hướng **2 giờ** bằng đầu bo tròn hoặc một chấm đỏ sẫm. Cảm giác: một nét bút viết liền, hành trình học đi lên.
- **Chi tiết đặc trưng: nét nối và nét vút.** Các nét nối giữa E–D–U và nét vút cuối là phần nhận ra ngay của logo, giống vai trò chi tiết riêng trong chữ của Anthropic. Vẫn phải đọc rõ ra E, D, U.
- **Màu:** chữ và nét nối màu mực (kem trên nền đỏ); **nét vút cuối** (đoạn bay lên 2 giờ) màu đỏ sẫm. Đỏ chỉ dùng cho nét vút.
- **Ý nghĩa:** nét bút liền = viết, học; nét vút lên 2 giờ = vươn ra, tiến bộ. Ba chữ nối liền = ba bên (học sinh/phụ huynh, gia sư, quản trị) cùng đi một đường.
- **Wordmark "THE EDUCATIONS":** chữ hoa cùng họ nét; trong chữ **EDU** của EDUCATIONS đã có sẵn các **nét nối nhỏ** giữa E–D–U (mảnh hơn), để wordmark có cá tính riêng như chữ của Anthropic.
- **Lưu ý:** nối chữ dễ làm khó đọc; phải chứng minh vẫn đọc ra "EDU" ở 40px. Bản favicon chỉ có chữ E và nét vút ngắn.

## 4. Animation thu gọn khi cuộn trang [CHỐT ý tưởng, ĐỀ XUẤT chi tiết]

**Yêu cầu của chủ dự án [CHỐT]:** logo hoạt động giống Anthropic: lúc đầu trang là wordmark đầy đủ, khi cuộn xuống các chữ co lại và kéo về còn **dấu hiệu rút gọn** (của Anthropic là "A\"; của chúng ta là EDU viết liền nét).

Mô tả chuyển động:

1. **Trạng thái mở (cuộn = 0):** hiện đủ "THE EDUCATIONS"; giữa E–D–U chỉ có nét nối rất ngắn.
2. **Đang cuộn (khoảng 0–240px):**
   - "THE" trượt sang trái và mờ dần; "CATIONS" trượt về phía chữ U và mờ dần.
   - E, D, U **khép khoảng cách** lại; mỗi chữ chậm hơn chữ trước một nhịp ngắn (khoảng 40ms mỗi chữ tính theo tiến độ).
   - Các **nét nối giữa E–D–U tự "viết" ra** (dựng bằng `stroke-dashoffset`, như bút đang vẽ), rồi nét cuối của U **vút lên** và **dừng đúng ở hướng 2 giờ**. Nét vút được phép lố rất nhẹ (tối đa khoảng 2%) rồi về chỗ.
3. **Trạng thái thu gọn:** chỉ còn EDU nét liền với nét vút đỏ ở 2 giờ.
4. **Cuộn ngược:** nét nối thu lại, các chữ tách ra và wordmark trở lại; mượt, không giật.
5. **Gắn với thanh cuộn (scroll-linked):** tiến độ animation theo vị trí cuộn.
6. **Giảm chuyển động (reduced motion):** không animation; chuyển tức thời giữa hai trạng thái ở một ngưỡng cuộn.

Chỉ dùng dịch ngang, vẽ nét (stroke) và opacity; **không blur, không nghiêng chữ, không scale chữ**.

Ở đâu hiển thị:

- **Landing và trang công khai:** wordmark đầy đủ ở đầu trang, thu gọn khi cuộn.
- **Ô góc phải trên của app quản trị** (ô đang hiện "QH"): hiện **EDU thu gọn** trong khung tròn đỏ sẫm, cỡ khoảng 40 CSS px. Hover phát lại một lần animation mở rộng. **[CẦN CHỐT]:** logo này thay hẳn chữ "QH", hay chỉ hiện cho tài khoản quản trị. Điều này làm người dùng mất chỗ nhận diện tài khoản, nên cần chủ dự án quyết định trước khi sửa code.

## 5. Yêu cầu kỹ thuật và kích thước

- **Vector thuần (SVG).** Chữ phải được chuyển thành đường (outline), không phụ thuộc font ngoài. Animation làm bằng SVG + CSS hoặc Web Animations API; tránh video/GIF/raster.
- Đọc rõ ở **40px (ô avatar), 120px+ (wordmark)**. Ở **16–32px (favicon)** ba chữ EDU không đọc được: dùng **bản rút gọn chỉ chữ E** (kèm chi tiết đặc trưng nếu còn rõ), Claude Design phải đề xuất và vẽ bản này.
- Bản **một màu** (mực hoặc kem) và bản **nền đỏ**; bản nền tối nếu app sau này có chế độ tối.
- Có **vùng an toàn** quanh logo (tối thiểu bằng độ dày nét chính).
- Bao gồm cả bản **trạng thái giữa** của animation để kiểm tra nhìn dừng hình.

## 6. Những điều cần tránh

- Chữ E đơn điệu chỉ đổi màu một thanh cho có; hình ghép sơ sài.
- Mũ cử nhân, sách mở, bóng đèn, bút chì (hình vẽ), dấu tích, bảng điểm: sáo mòn và hai thứ cuối gợi quiz/chấm điểm, ngoài phạm vi.
- Gradient, bóng đổ, hiệu ứng 3D, blur.
- Sao chép nguyên "\" hoặc kiểu chữ của Anthropic.
- Địa cầu vẽ đầy đủ kinh vĩ tuyến (quá chi tiết, chết ở cỡ nhỏ).
- Phụ thuộc vào màu để đọc nghĩa (phải đọc được khi một màu).

---

# PHẦN 2 — PROMPT THIẾT KẾ CHO CLAUDE DESIGN (EDU nét liền)

Gửi nguyên khối bên dưới cho một phiên Claude Design. Prompt tự đủ ý, không cần đính kèm file này.

```text
Hãy thiết kế logo cho tổ chức "The Educations" (tổ chức đứng sau website tìm gia sư "Gia Sư 10 Điểm" tại Việt Nam), kèm animation thu gọn khi cuộn trang. Đây là HƯỚNG B trong hai hướng được làm song song; hãy làm trọn vẹn theo đúng hướng này.

BỐI CẢNH
- The Educations là tổ chức giáo dục; tên số nhiều vì sau này có thể mở thêm nhiều sản phẩm. Sản phẩm hiện tại chỉ là nền tảng TÌM GIA SƯ (không có quiz, đáp án, chấm điểm).
- Ba bên cùng dùng nền tảng: học sinh/phụ huynh, gia sư, quản trị viên. Điều cốt lõi là sự tin cậy: hồ sơ gia sư được duyệt, đánh giá chỉ từ buổi học thật.
- Giọng thương hiệu: ấm, chính xác, tử tế, giống giấy và mực; không lạnh kiểu công nghệ, không phô trương.
- Bảng màu bắt buộc: đỏ sẫm #852f36, nền giấy #faf8f3, mực #282820, kem #fffdfa, kem đậm #e9e5dc. Không dùng gradient, bóng đổ, 3D hay blur.

CÁCH NGHĨ CẦN HỌC TỪ WORDMARK CỦA ANTHROPIC (học cách nghĩ, KHÔNG sao chép hình)
- Wordmark của họ "ANTHROP\C" thu lại thành "A\" khi cuộn xuống. "A\" đọc ra "AI": dấu hiệu thu gọn vẫn mang nghĩa đúng lĩnh vực của họ. Của chúng tôi phải làm điều tương tự: dấu hiệu thu gọn là "EDU", đọc ra "giáo dục".
- Chữ của họ là chữ hoa hình học nhưng có một chi tiết riêng khiến nhận ra ngay. Wordmark của chúng tôi cũng phải có MỘT chi tiết đặc trưng nằm ngay trong chữ (mô tả bên dưới), không phải chữ sans-serif thường.
- Chuyển động liền mạch và có nhịp, không "bụp" biến mất.

TINH THẦN THIẾT KẾ (quan trọng: tôi cần nghệ thuật, uyển chuyển, đúng phong cách giáo dục)
- Cảm giác nét bút mực / phấn trên giấy: đường cong liên tục, đầu nét bo, độ dày có nhịp nhẹ (dày ở thân, mảnh dần ở chỗ chuyển) nhưng vẫn là vector sạch và đọc rõ ở cỡ nhỏ. Không phải nét đơn đều đều.
- Hình học nền là đường tròn: cung của D, U và chi tiết đặc trưng cùng một họ cong, dựng trên một lưới có tỉ lệ rõ ràng. Hãy nêu lưới đó trong notes.
- Ấm và uyển chuyển như một động tác dẫn dắt, không cứng như logo công nghệ, không gợi bảng điểm.
- TUYỆT ĐỐI không làm kiểu "chữ E thường chỉ đổi màu một thanh": bản đó đã bị loại vì đơn điệu và nhận diện yếu.

DẤU HIỆU THU GỌN: "EDU" (HƯỚNG B: EDU VIẾT BẰNG MỘT NÉT LIỀN)
- Dấu hiệu thu gọn là ba chữ "EDU" (ba chữ đầu của EDUCATIONS, cách viết tắt quen thuộc của giáo dục), viết như MỘT NÉT BÚT LIỀN: chân chữ E chảy sang thân chữ D, bụng chữ D chảy sang đáy chữ U, và nét cuối của U vút lên cao sang phải, kết thúc ở hướng 2 GIỜ (phía trên bên phải, khoảng 60° tính từ phương thẳng đứng theo chiều kim đồng hồ) bằng đầu bo tròn hoặc một chấm nhỏ màu đỏ #852f36. Cảm giác: nét bút đang viết, hành trình học đi lên, vươn ra.
- CHI TIẾT ĐẶC TRƯNG: các nét nối giữa E–D–U và nét vút cuối. Đây là phần nhận ra ngay của logo. Vẫn phải đọc rõ ra E, D, U; hãy chứng minh ở 40px.
- Màu: chữ và nét nối màu mực #282820 (kem #fffdfa trên nền đỏ). Nét vút cuối (đoạn bay lên 2 giờ) màu đỏ #852f36. Đỏ chỉ dùng cho nét vút.
- Dùng ngôn ngữ chữ viết tay có kiểm soát, không phải chữ thảo kiểu thiệp mời; hình học nền vẫn là đường tròn và đường cong liên tục.
- Wordmark đầy đủ: chữ in hoa "THE EDUCATIONS", cùng họ nét, độ đậm 600–700, giãn chữ vừa phải. Trong chữ EDU của EDUCATIONS đã có sẵn các nét nối nhỏ giữa E–D–U (mảnh hơn) để wordmark có cá tính riêng.
- Bản favicon chỉ có chữ E và nét vút ngắn.

ANIMATION (giống tinh thần logo Anthropic thu lại khi cuộn xuống, nhưng là logo riêng của chúng tôi)
- Trạng thái mở (cuộn = 0): hiện đủ "THE EDUCATIONS"; giữa E–D–U chỉ có nét nối rất ngắn.
- Cuộn xuống khoảng 0–240px: "THE" trượt sang trái và mờ dần; "CATIONS" trượt về phía chữ U và mờ dần; E, D, U khép khoảng cách, mỗi chữ chậm hơn chữ trước một nhịp ngắn; các nét nối giữa E–D–U tự "viết" ra như bút đang vẽ (dùng stroke-dashoffset), rồi nét cuối của U vút lên và dừng đúng ở hướng 2 giờ (được phép lố tối đa khoảng 2% rồi về chỗ).
- Trạng thái thu gọn: chỉ còn EDU nét liền với nét vút đỏ ở 2 giờ.
- Cuộn ngược thì nét nối thu lại, các chữ tách ra, wordmark trở lại; mượt mà. Tiến độ gắn với vị trí cuộn (scroll-linked), không phải bật/tắt cố định.
- Chỉ dùng dịch ngang, vẽ nét (stroke) và opacity; KHÔNG blur, KHÔNG nghiêng chữ, KHÔNG scale chữ. Chọn đường cong easing mềm, không tuyến tính.
- Tôn trọng prefers-reduced-motion: không animation, chuyển tức thời giữa hai trạng thái ở một ngưỡng cuộn.
- Dùng SVG thuần, chữ đã chuyển thành đường (outline), animation bằng SVG + CSS hoặc Web Animations API; không video, GIF hay raster.

VỊ TRÍ SỬ DỤNG
1. Đầu trang landing và trang công khai: wordmark đầy đủ, thu gọn khi cuộn.
2. Góc phải trên của giao diện quản trị, thay cho ô tròn hiện hiển thị chữ viết tắt tài khoản ("QH", khoảng 40px): dấu hiệu thu gọn EDU màu kem trong khung tròn đỏ sẫm #852f36, vừa khít và cân đối trong vòng tròn.
3. Favicon 16px/32px và icon cảm ứng: dùng bản rút gọn chỉ chữ E (EDU không đọc được ở cỡ này).

SẢN PHẨM CẦN GIAO (giữ đúng danh sách và tên file này để so sánh với hướng khác)
- Thư mục `logo-B/` chứa: `mark.svg` (EDU thu gọn trên nền đỏ, vừa khung tròn 40px), `mark-transparent.svg`, `mark-small.svg` (bản rút gọn cho favicon 16–32px), `wordmark.svg`, `mono-ink.svg`, `mono-cream-on-red.svg`.
- `demo.html` duy nhất, tự chứa, cuộn được: cho thấy animation theo cuộn, một thanh trượt để dừng ở các tiến độ 0, 0.25, 0.5, 0.75, 1, và xem trước ở 16, 32, 40, 120px, trên nền giấy và nền đỏ.
- `EducationsLogo.tsx` (React + TypeScript) nhận prop `progress` (0 đến 1) và `reducedMotion` (boolean).
- `notes.md` ngắn: lý do thiết kế, hệ tỉ lệ/lưới đã dùng, vùng an toàn, những gì đã cân nhắc nhưng bỏ. Nếu còn lưỡng lự giữa hai cách, nêu bản phụ trong notes (không làm thành bản chính).

TRÁNH
- Chữ E đơn điệu chỉ đổi màu một thanh cho có; hình ghép sơ sài.
- Mũ cử nhân, sách mở, bóng đèn, bút chì (hình vẽ), dấu tích, bảng điểm.
- Gradient, bóng đổ, 3D, blur.
- Sao chép dấu "\" hay kiểu chữ của Anthropic.
- Phụ thuộc vào màu để đọc nghĩa: logo một màu vẫn phải đọc được.
```

---

## Cách so sánh với hướng còn lại và việc cần chốt trước khi gắn vào app

Đặt `demo.html` của hai hướng cạnh nhau và xét theo thứ tự:

1. Có đọc ra "EDU" ngay không, và chất nghệ thuật có thật không (không đơn điệu, không như chữ thường).
2. Đọc rõ ở 40px (ô avatar) và bản rút gọn ở 16px.
3. Hình dừng ở 0.25, 0.5, 0.75 của animation có đẹp không.
4. Bản một màu còn nhận ra không, và có gợi thương hiệu khác không.

| # | Câu hỏi | Đề xuất mặc định |
| --- | --- | --- |
| 1 | Chọn hướng nào sau khi xem hai bản? | Chọn theo 4 tiêu chí trên |
| 2 | Ô góc phải trên: thay hẳn chữ "QH" bằng logo, hay chỉ hiện logo cho tài khoản quản trị? | Chỉ hiện cho quản trị; tài khoản khác giữ chữ viết tắt |
| 3 | Logo này là của **tổ chức** The Educations; giữ nguyên icon "10" cho sản phẩm Gia Sư 10 Điểm? | Giữ icon "10" cho sản phẩm, logo mới chỉ cho tổ chức |
