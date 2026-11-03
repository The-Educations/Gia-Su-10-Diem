import { CommunityLock } from "./AdminCommunity";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Copy, Pencil, Flag } from "lucide-react";
import { toast } from "sonner";
import { useApp, useLoad } from "@/lib/api";
import type { CommunityMemberResponse, CommunityFeed } from "@/lib/types";
import {
  Page,
  Person,
  Loading,
  ErrorState,
  Blank,
  Choose,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { memberImageUrl, PostCard } from "@/components/community/shared";
import ProfileEditor from "@/components/community/ProfileEditor";
import ActionDialog, {
  type CommunityAction,
} from "@/components/community/ActionDialog";

export default function CommunityProfile() {
  const { code } = useParams(),
    { user } = useApp();
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") === "helpful" ? "helpful" : "new";
  const page = Math.min(
    100000,
    Math.max(1, Math.trunc(Number(params.get("page"))) || 1),
  );
  const result = useLoad<CommunityMemberResponse>(`/community/members/${code}`);
  const posts = useLoad<CommunityFeed>(
    result.data
      ? `/community/members/${code}/posts?sort=${sort}&page=${page}`
      : null,
  );
  const [editing, setEditing] = useState(false),
    [link, setLink] = useState("");
  const [action, setAction] = useState<CommunityAction | null>(null);
  useEffect(() => {
    setEditing(false);
    setLink("");
    setAction(null);
  }, [code]);
  if (result.loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (result.error)
    return (
      <Page>
        <ErrorState error={result.error} retry={result.reload} />
      </Page>
    );
  if (!result.data) return null;
  const p = result.data.profile;
  const tier = {
    student: "Học sinh",
    parent: "Phụ huynh",
    tutor: "Gia sư",
    admin: "Quản trị viên",
  }[p.tier];
  const [year, month] = p.joined_at.split("-");
  return (
    <Page>
      <div className="community-member" key={code}>
        <Link className="text-link" to="/community">
          Cộng đồng
        </Link>
        <section className="member-header">
          <div className="member-cover">
            {p.has_cover && (
              <img
                src={memberImageUrl(p, "cover")}
                alt={`Ảnh bìa của ${p.name_part}`}
              />
            )}
          </div>
          <div className="member-summary">
            <div className="member-avatar">
              <Person
                large
                name={p.name_part}
                src={p.has_avatar ? memberImageUrl(p, "avatar") : undefined}
              />
            </div>
            <div className="member-title">
              <h1>{p.name_part}</h1>
              <Badge variant="secondary">{tier}</Badge>
              <p>
                Tham gia tháng {Number(month)}/{year}
              </p>
            </div>
            <div className="community-actions member-actions">
              <Button
                variant="outline"
                onClick={async () => {
                  const url = `${window.location.origin}/app/community/members/${p.code}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setLink("");
                    toast.success("Đã sao chép liên kết");
                  } catch {
                    setLink(url);
                  }
                }}
              >
                <Copy aria-hidden="true" />
                Sao chép liên kết
              </Button>
              {p.mine && !user?.community_locked && (
                <Button onClick={() => setEditing(true)}>
                  <Pencil aria-hidden="true" />
                  Chỉnh sửa hồ sơ
                </Button>
              )}
              {!p.mine && user?.role !== "admin" && !user?.community_locked && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setAction({
                      title: "Báo cáo hồ sơ",
                      path: "/community/reports",
                      method: "POST",
                      report: true,
                      profileReport: true,
                      body: { target_type: "profile", target_id: p.code },
                    })
                  }
                >
                  <Flag aria-hidden="true" />
                  Báo cáo
                </Button>
              )}
              {p.tier === "tutor" && (
                <Button asChild variant="outline">
                  <Link to={`/tutors/${p.tutor_id}`}>Xem hồ sơ gia sư</Link>
                </Button>
              )}
            </div>
            {link && (
              <Input
                aria-label="Liên kết hồ sơ"
                value={link}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
            )}
            {p.bio && <p className="member-bio">{p.bio}</p>}
            {p.mine && (
              <nav className="member-owner-links" aria-label="Hồ sơ của tôi">
                <Link to="/community/mine">Bài của tôi</Link>
                <Link to="/settings">Cài đặt tài khoản</Link>
              </nav>
            )}
            {p.mine &&
              !user?.community_locked &&
              (!p.has_avatar || !p.has_cover || !p.bio || !p.display_name) && (
                <Button
                  variant="link"
                  className="member-completion"
                  onClick={() => setEditing(true)}
                >
                  Bổ sung{" "}
                  {[
                    !p.has_avatar && "ảnh đại diện",
                    !p.has_cover && "ảnh bìa",
                    !p.bio && "giới thiệu",
                    !p.display_name && "tên hiển thị",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Button>
              )}
            <dl className="member-stats">
              <div>
                <dt>Bài viết</dt>
                <dd>{p.stats.posts}</dd>
              </div>
              <div>
                <dt>Bình luận</dt>
                <dd>{p.stats.comments}</dd>
              </div>
              <div>
                <dt>Hữu ích</dt>
                <dd>{p.stats.helpful}</dd>
              </div>
            </dl>
          </div>
        </section>
        {result.data.admin && (
          <section
            className="community-card member-admin"
            aria-label="Quản trị hồ sơ"
          >
            <h2>Quản trị hồ sơ</h2>
            <dl>
              <dt>Họ và tên</dt>
              <dd>{result.data.admin.name}</dd>
              <dt>Email</dt>
              <dd>{result.data.admin.email}</dd>
              <dt>Tài khoản</dt>
              <dd>
                {{
                  active: "Đang hoạt động",
                  suspended: "Tạm khóa",
                  deleted: "Đã xóa",
                }[result.data.admin.status] || result.data.admin.status}
              </dd>
              <dt>Quyền cộng đồng</dt>
              <dd>
                {result.data.admin.community_locked ? "Đã khóa" : "Đang mở"}
              </dd>
            </dl>
            <div className="community-actions">
              {(["avatar", "cover", "bio"] as const)
                .filter((part) =>
                  part === "bio"
                    ? !!p.bio
                    : part === "avatar"
                      ? p.has_avatar
                      : p.has_cover,
                )
                .map((part) => (
                  <Button
                    key={part}
                    variant="outline"
                    onClick={() =>
                      setAction({
                        title: {
                          avatar: "Gỡ ảnh đại diện",
                          cover: "Gỡ ảnh bìa",
                          bio: "Xóa giới thiệu",
                        }[part],
                        path: `/admin/community/members/${p.code}/${part}`,
                        method: "DELETE",
                        reasonField: "note",
                      })
                    }
                  >
                    {
                      {
                        avatar: "Gỡ ảnh đại diện",
                        cover: "Gỡ ảnh bìa",
                        bio: "Xóa giới thiệu",
                      }[part]
                    }
                  </Button>
                ))}
              <CommunityLock owner={result.data.admin} />
              <Button asChild variant="outline">
                <Link to="/admin?tab=users">Quản lý tài khoản</Link>
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Bài viết đã đăng">
          <div className="member-posts-heading">
            <h2>Bài viết đã đăng</h2>
            <Choose
              label="Sắp xếp bài viết"
              value={sort}
              onChange={(sort) => setParams({ sort })}
              options={[
                { value: "new", label: "Mới nhất" },
                { value: "helpful", label: "Hữu ích nhất" },
              ]}
            />
          </div>
          {posts.loading ? (
            <Loading />
          ) : posts.error ? (
            <ErrorState error={posts.error} retry={posts.reload} />
          ) : (
            <>
              <div className="community-feed">
                {posts.data?.items.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
              {!posts.data?.items.length && (
                <Blank title="Chưa có bài viết nào" />
              )}
              {(page > 1 || posts.data?.more) && (
                <nav className="community-actions" aria-label="Trang bài viết">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setParams({ sort, page: String(page - 1) })}
                  >
                    Trang trước
                  </Button>
                  <span>Trang {page}</span>
                  <Button
                    variant="outline"
                    disabled={!posts.data?.more}
                    onClick={() => setParams({ sort, page: String(page + 1) })}
                  >
                    Trang sau
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
        {editing && p.mine && (
          <ProfileEditor
            key={p.code}
            profile={p}
            close={() => setEditing(false)}
          />
        )}
        {action && (
          <ActionDialog action={action} close={() => setAction(null)} />
        )}
      </div>
    </Page>
  );
}
