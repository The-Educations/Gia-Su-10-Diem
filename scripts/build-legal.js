import { mkdir, writeFile } from "node:fs/promises";
import { renderSeo } from "../server/seo.js";

const contact = '<a href="mailto:contact@giasudiem10.online">contact@giasudiem10.online</a>';
const pages = {
  privacy: {
    title: "Chính sách quyền riêng tư",
    content: `
<p>Chính sách này giải thích cách Gia Sư 10 Điểm xử lý thông tin khi bạn sử dụng giasudiem10.online. Liên hệ về dữ liệu cá nhân: ${contact}.</p>
<h2>Thông tin được thu thập</h2>
<p>Chúng tôi lưu thông tin bạn cung cấp khi tạo và sử dụng tài khoản: tên, email, vai trò học sinh hoặc gia sư, mục tiêu học tập, hồ sơ gia sư, môn học, học phí, địa điểm, giờ trống, ảnh và CV bạn tải lên. Mật khẩu đăng ký trực tiếp được lưu dưới dạng băm, không ở dạng văn bản đọc được.</p>
<p>Hoạt động trên nền tảng gồm lịch đặt học, trạng thái buổi học, tin nhắn, gia sư đã lưu, đánh giá, lượt thích và bình luận. Hệ thống cũng xử lý cookie phiên đăng nhập, địa chỉ IP để giới hạn yêu cầu và nhật ký quản trị phục vụ bảo mật.</p>
<h2>Đăng nhập bằng Google</h2>
<p>Khi bạn chọn đăng nhập bằng Google, ứng dụng yêu cầu thông tin nhận dạng cơ bản với các phạm vi openid, email và profile. Chúng tôi dùng mã định danh Google, tên và email đã xác minh để tạo, đăng nhập hoặc liên kết tài khoản theo lựa chọn của bạn. Ứng dụng không yêu cầu quyền đọc Gmail, Google Drive, danh bạ hay lịch của bạn và không lưu access token hoặc refresh token của Google sau bước đăng nhập.</p>
<p>Bạn có thể thu hồi quyền truy cập tại <a href="https://myaccount.google.com/connections">trang kết nối tài khoản Google</a>. Việc thu hồi không tự xóa tài khoản hoặc dữ liệu đã lưu trên Gia Sư 10 Điểm; hãy liên hệ chúng tôi nếu bạn muốn yêu cầu xóa.</p>
<h2>Mục đích sử dụng</h2>
<p>Thông tin được dùng để xác thực tài khoản, tìm và kết nối gia sư, xử lý lịch học, trao đổi tin nhắn, hiển thị hồ sơ và nội dung bạn công bố, hỗ trợ người dùng, kiểm duyệt và ngăn chặn lạm dụng. Dữ liệu nhận từ Google được dùng cho việc nhận dạng và quản lý tài khoản, không phục vụ quảng cáo cá nhân hóa.</p>
<h2>Ai có thể xem thông tin</h2>
<p>Hồ sơ gia sư đã được duyệt, ảnh và CV công khai, đánh giá và bình luận công khai có thể được người khác xem. Không tải thông tin nhạy cảm hoặc thông tin của người khác vào các nội dung công khai nếu chưa có quyền chia sẻ.</p>
<p>Tin nhắn và thông tin lịch học được cung cấp cho các bên liên quan. Quản trị viên có thể xem dữ liệu cần thiết để quản lý nền tảng, giải quyết yêu cầu hỗ trợ và kiểm duyệt. Cloudflare cung cấp hạ tầng lưu trữ, xử lý và bảo vệ website; Google xử lý bước đăng nhập khi bạn lựa chọn sử dụng. Hạ tầng của các nhà cung cấp có thể xử lý dữ liệu ngoài quốc gia bạn đang ở.</p>
<h2>Cookie và bộ nhớ trình duyệt</h2>
<p>Cookie cần thiết duy trì phiên đăng nhập và bảo vệ quá trình đăng nhập Google. Bộ nhớ trình duyệt lưu lựa chọn giao diện như trạng thái thu gọn thanh điều hướng. Bạn có thể xóa chúng trong trình duyệt; xóa cookie đăng nhập sẽ yêu cầu bạn đăng nhập lại. Nhà cung cấp hạ tầng có thể xử lý thông tin kỹ thuật và lưu lượng để bảo vệ và vận hành dịch vụ.</p>
<h2>Lưu giữ, sửa và xóa dữ liệu</h2>
<p>Dữ liệu được lưu để vận hành tài khoản, lịch học, hỗ trợ và bảo mật. Hiện nền tảng chưa áp dụng lịch xóa tự động cho mọi loại dữ liệu. Bạn có thể sửa thông tin trong phần cài đặt và gửi yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu tới ${contact}. Chúng tôi sẽ xác minh quyền sở hữu trước khi xử lý; một số thông tin có thể cần được giữ để giải quyết tranh chấp, bảo vệ dịch vụ hoặc đáp ứng nghĩa vụ pháp luật. Bản sao lưu có thể tồn tại sau khi dữ liệu hoạt động được xóa.</p>
<h2>Người dùng chưa thành niên</h2>
<p>Nếu chưa đủ tuổi tự chấp thuận việc xử lý dữ liệu theo pháp luật áp dụng, bạn cần cha mẹ hoặc người giám hộ đồng ý và hỗ trợ sử dụng dịch vụ. Cha mẹ hoặc người giám hộ có thể liên hệ để yêu cầu xem xét hoặc xóa thông tin của trẻ.</p>
<h2>Thay đổi và liên hệ</h2>
<p>Chúng tôi cập nhật chính sách trên trang này khi cách xử lý dữ liệu thay đổi. Gửi thắc mắc hoặc yêu cầu về quyền riêng tư tới ${contact}.</p>`,
  },
  terms: {
    title: "Điều khoản dịch vụ",
    content: `
<p>Các điều khoản này áp dụng khi bạn sử dụng Gia Sư 10 Điểm tại giasudiem10.online. Khi tạo tài khoản hoặc sử dụng dịch vụ, bạn đồng ý tuân thủ các điều khoản này và đọc <a href="/privacy">Chính sách quyền riêng tư</a>. Liên hệ hỗ trợ: ${contact}.</p>
<h2>Dịch vụ kết nối học tập</h2>
<p>Gia Sư 10 Điểm cung cấp công cụ tìm gia sư, công bố hồ sơ, trao đổi, quản lý giờ trống và đặt lịch học. Hồ sơ được duyệt để công bố không đồng nghĩa với bảo đảm mọi bằng cấp, chất lượng giảng dạy hoặc kết quả học tập. Học sinh, phụ huynh và gia sư cần trao đổi, kiểm tra thông tin và thống nhất nội dung trước khi học.</p>
<h2>Tài khoản và độ tuổi</h2>
<p>Bạn cần cung cấp thông tin chính xác, bảo vệ tài khoản và không mạo danh người khác. Nếu chưa đủ tuổi tự giao kết hoặc đồng ý theo pháp luật áp dụng, hãy sử dụng dịch vụ với sự đồng ý và giám sát của cha mẹ hoặc người giám hộ. Báo cho chúng tôi khi nghi ngờ tài khoản bị truy cập trái phép.</p>
<h2>Lịch học, học phí và hủy lịch</h2>
<p>Gia sư chịu trách nhiệm về nội dung hồ sơ, mức học phí và giờ trống đã công bố. Yêu cầu đặt lịch cần được gia sư xác nhận. Các bên cần thống nhất thời gian, hình thức, địa điểm, học phí, cách thanh toán và điều kiện hủy hoặc hoàn tiền trước buổi học. Việc tạo lịch trên website không tự thực hiện thanh toán hay tạo bảo đảm hoàn tiền từ nền tảng.</p>
<p>Nếu cần đổi hoặc hủy lịch, hãy sử dụng chức năng phù hợp và thông báo sớm cho bên còn lại. Nếu có tranh chấp, gửi thông tin liên quan tới ${contact} để được xem xét hỗ trợ.</p>
<h2>Nội dung và hành vi được phép</h2>
<p>Bạn giữ quyền đối với nội dung của mình và cho phép nền tảng lưu trữ, xử lý, hiển thị nội dung đó để cung cấp dịch vụ theo lựa chọn công khai của bạn. Bạn phải có quyền sử dụng ảnh, tài liệu và CV tải lên; không công bố dữ liệu cá nhân của người khác khi chưa được phép.</p>
<p>Không đăng nội dung vi phạm pháp luật, quấy rối, lừa đảo, xâm phạm quyền sở hữu trí tuệ; không tạo đánh giá giả, gửi thư rác, khai thác trái phép tài khoản hay can thiệp hoạt động của dịch vụ.</p>
<h2>Kiểm duyệt và hạn chế tài khoản</h2>
<p>Quản trị viên có thể yêu cầu sửa, ẩn hoặc gỡ nội dung và hạn chế tài khoản khi phát hiện vi phạm, rủi ro bảo mật hoặc có yêu cầu pháp lý. Bạn có thể liên hệ ${contact} để cung cấp thông tin bổ sung hoặc yêu cầu xem xét quyết định.</p>
<h2>Khả dụng và trách nhiệm</h2>
<p>Chúng tôi cố gắng duy trì dịch vụ nhưng không bảo đảm website luôn hoạt động liên tục, không lỗi hoặc phù hợp với mọi mục tiêu học tập. Các bên chịu trách nhiệm về thông tin, thỏa thuận và hành vi của mình. Không điều khoản nào loại trừ quyền của người tiêu dùng hoặc trách nhiệm không thể loại trừ theo pháp luật áp dụng.</p>
<h2>Ngừng sử dụng và yêu cầu xóa</h2>
<p>Bạn có thể ngừng sử dụng dịch vụ và gửi yêu cầu đóng tài khoản hoặc xóa dữ liệu tới ${contact}. Việc lưu giữ và xử lý dữ liệu tuân theo Chính sách quyền riêng tư; các lịch học hoặc tranh chấp chưa hoàn tất cần được giải quyết với các bên liên quan.</p>
<h2>Thay đổi điều khoản</h2>
<p>Phiên bản hiện hành được công bố tại trang này cùng ngày cập nhật. Khi có thay đổi ảnh hưởng đến việc sử dụng dịch vụ, hãy xem lại điều khoản trước khi tiếp tục. Mọi thắc mắc có thể gửi tới ${contact}.</p>`,
  },
};

await mkdir("dist/legal", { recursive: true });
for (const [slug, page] of Object.entries(pages)) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/assets/brand-icon-20261031.svg"><style>
*{box-sizing:border-box}body{margin:0;background:#f7f4ed;color:#292b23;font:17px/1.75 system-ui,sans-serif}header,main,footer{max-width:800px;margin:auto;padding:24px}header{border-bottom:1px solid #ded9cd}a{color:#852f36;text-underline-offset:4px;overflow-wrap:anywhere}a:focus-visible{outline:2px solid #852f36;outline-offset:4px}h1{font-size:clamp(28px,6vw,42px);line-height:1.25;margin:24px 0}h2{font-size:23px;line-height:1.4;margin:32px 0 12px}p{margin:12px 0}time{color:#68695e;font-size:14px}footer{display:flex;flex-wrap:wrap;gap:12px 24px;border-top:1px solid #ded9cd}footer a{padding:10px 0}.skip{position:absolute;top:-100px}.skip:focus{top:0;background:#fff;padding:12px}@media(max-width:400px){header,main,footer{padding:20px}body{font-size:16px}}
</style></head><body><a class="skip" href="#main">Đến nội dung</a><header><a href="/">Gia Sư 10 Điểm</a></header><main id="main"><h1>${page.title}</h1><time datetime="2026-11-02">Cập nhật ngày 2 tháng 11 năm 2026</time>${page.content}</main><footer><a href="/privacy">Quyền riêng tư</a><a href="/terms">Điều khoản dịch vụ</a><a href="mailto:contact@giasudiem10.online">Liên hệ</a></footer></body></html>`;
  await writeFile(`dist/legal/${slug}.html`, renderSeo(html, `/${slug}`));
}
