import { Collapsible } from "@animate-ui/react/primitives/radix-ui/collapsible";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Heart,
  MapPin,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  GraduationCap,
  Star,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, fold, money } from "@/lib/api";
import type { Tutor, Subject, Resource } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Page,
  Heading,
  Person,
  Choose,
  Blank,
  Loading,
  ErrorState,
} from "@/components/common";
export default function Tutors({
  favoritesOnly = false,
}: {
  favoritesOnly?: boolean;
}) {
  const { user } = useApp(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    [saving, setSaving] = useState<number | null>(null),
    [advanced, setAdvanced] = useState(
      !!(params.get("goal") || params.get("level") || params.get("location")),
    );
  const tutors = useLoad<Tutor[]>("/tutors"),
    subjects = useLoad<Subject[]>("/subjects"),
    exams = useLoad<Resource[]>("/resources"),
    favorites = useLoad<number[]>(
      user?.role === "student" ? "/favorites" : null,
    );
  const q = params.get("q") || "",
    subject = params.get("subject") || "",
    mode = params.get("mode") || "",
    location = params.get("location") || "",
    budget = params.get("budget") || "",
    sort = params.get("sort") || "recommended",
    level = params.get("level") || "",
    goal = params.get("goal") || "";
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    setParams(p, { replace: true });
  };
  const rows = (tutors.data || [])
    .filter(
      (t) =>
        (!favoritesOnly || favorites.data?.includes(t.user_id)) &&
        (!subject || t.subjects.includes(subject)) &&
        (!level || t.levels.includes(level)) &&
        (!goal || t.goals.includes(goal)) &&
        (!q ||
          fold(
            `${t.name} ${t.headline} ${t.education} ${t.location} ${t.subjects.map((id) => subjects.data?.find((s) => s.id === id)?.name || id).join(" ")} ${t.goals.join(" ")}`,
          ).includes(fold(q))) &&
        (!mode || t.mode === mode || t.mode === "both") &&
        (!location || t.location === location) &&
        (!budget || t.rate <= Number(budget)),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.rate - b.rate
        : sort === "experience"
          ? b.experience - a.experience
          : b.rating - a.rating,
    );
  async function favorite(t: Tutor) {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (user.role !== "student") {
      toast.info("Lưu gia sư dành cho tài khoản học sinh.");
      return;
    }
    setSaving(t.user_id);
    try {
      await api(
        `/favorites/${t.user_id}`,
        favorites.data?.includes(t.user_id) ? "DELETE" : "PUT",
      );
      favorites.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }
  return (
    <Page>
      <Heading
        title={favoritesOnly ? "Gia sư đã lưu" : "Tìm gia sư"}
        action={
          !user && (
            <Button asChild variant="outline">
              <Link to="/auth?mode=register&role=tutor">
                Đăng ký làm gia sư
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          )
        }
      />

      <section className="search-panel" aria-label="Bộ lọc gia sư">
        <Collapsible.Root open={advanced} onOpenChange={setAdvanced}>
          <div className="search-row">
            <Field>
              <FieldLabel htmlFor="tutor-search" className="sr-only">
                Tìm gia sư
              </FieldLabel>
              <div className="search-input">
                <Search size={19} />
                <Input
                  id="tutor-search"
                  placeholder="Tên gia sư, trường hoặc từ khóa…"
                  value={q}
                  onChange={(e) => set("q", e.target.value)}
                />
              </div>
            </Field>
            <Collapsible.Trigger asChild>
              <Button variant="outline" className="advanced-filter-toggle">
                <SlidersHorizontal data-icon="inline-start" />
                Bộ lọc thêm
                {(location || goal || level) && (
                  <span
                    className="filter-dot"
                    aria-label="Có bộ lọc đang áp dụng"
                  />
                )}
              </Button>
            </Collapsible.Trigger>
          </div>
          <div className="filter-grid three">
            <Choose
              label="Môn học"
              value={subject}
              onChange={(v) => set("subject", v)}
              allLabel="Tất cả môn học"
              options={(subjects.data || []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
            <Choose
              label="Hình thức"
              value={mode}
              onChange={(v) => set("mode", v)}
              allLabel="Tất cả hình thức"
              options={[
                { value: "online", label: "Trực tuyến" },
                { value: "offline", label: "Trực tiếp" },
              ]}
            />
            <Choose
              label="Học phí / giờ"
              value={budget}
              onChange={(v) => set("budget", v)}
              allLabel="Mọi mức học phí"
              options={[150000, 200000, 300000].map((n) => ({
                value: String(n),
                label: `Đến ${money(n)}`,
              }))}
            />
          </div>
          <Collapsible.Content>
            <div className="filter-grid three secondary-filters">
              {" "}
              <Choose
                label="Địa điểm"
                value={location}
                onChange={(v) => set("location", v)}
                allLabel="Toàn quốc"
                options={[...new Set(tutors.data?.map((t) => t.location))].map(
                  (l) => ({ value: l, label: l }),
                )}
              />
              <Choose
                label="Cấp học"
                value={level}
                onChange={(v) => set("level", v)}
                allLabel="Tất cả cấp học"
                options={["Tiểu học", "THCS", "THPT", "Người đi làm"].map(
                  (v) => ({
                    value: v,
                    label: v,
                  }),
                )}
              />
              <Choose
                label="Mục tiêu kỳ thi"
                value={goal}
                onChange={(v) => set("goal", v)}
                allLabel="Tất cả mục tiêu"
                options={[...new Set(exams.data?.map((r) => r.category))].map(
                  (v) => ({ value: v, label: v }),
                )}
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
        {params.size > 0 && (
          <div className="active-filters">
            {q && <Badge variant="secondary">“{q}”</Badge>}
            {level && <Badge variant="secondary">{level}</Badge>}
            {goal && <Badge variant="secondary">{goal}</Badge>}
            {location && <Badge variant="secondary">{location}</Badge>}
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              Xóa bộ lọc
            </Button>
          </div>
        )}
      </section>
      <div className="results-heading" id="tutor-results">
        <h2>
          {rows.length} gia sư{favoritesOnly ? " đã lưu" : ""}
        </h2>
        <div className="sort-control">
          <Choose
            label="Sắp xếp"
            value={sort}
            onChange={(v) => set("sort", v)}
            options={[
              { value: "recommended", label: "Đánh giá cao" },
              { value: "price", label: "Học phí tăng dần" },
              { value: "experience", label: "Nhiều kinh nghiệm" },
            ]}
          />
        </div>
      </div>
      {tutors.loading ? (
        <Loading />
      ) : tutors.error ? (
        <ErrorState error={tutors.error} retry={tutors.reload} />
      ) : rows.length === 0 ? (
        <Blank
          title={
            favoritesOnly
              ? "Chưa lưu gia sư nào"
              : "Chưa tìm thấy gia sư phù hợp"
          }
          description="Thử môn học hoặc khoảng học phí khác."
          action={
            <Button
              variant="outline"
              onClick={() =>
                favoritesOnly ? navigate("/tutors") : setParams({})
              }
            >
              {favoritesOnly ? "Tìm gia sư" : "Xóa bộ lọc"}
            </Button>
          }
        />
      ) : (
        <div className="tutor-grid">
          {rows.map((t) => (
            <article className="tutor-card" key={t.user_id}>
              <div className="tutor-card-top">
                <Person
                  name={t.name}
                  id={t.user_id}
                  src={t.photo_url || undefined}
                  large
                />
                <div className="tutor-identity">
                  <Link to={`/tutors/${t.user_id}`}>
                    <h3>{t.name}</h3>
                  </Link>
                  <p>{t.headline}</p>
                </div>
                {(!user || user.role === "student") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={saving === t.user_id}
                    onClick={() => favorite(t)}
                    aria-label={`${favorites.data?.includes(t.user_id) ? "Bỏ lưu" : "Lưu"} ${t.name}`}
                    aria-pressed={!!favorites.data?.includes(t.user_id)}
                  >
                    <Heart
                      className={
                        favorites.data?.includes(t.user_id)
                          ? "heart-filled"
                          : ""
                      }
                    />
                  </Button>
                )}
              </div>
              <div className="subject-tags">
                {t.subjects.map((id) => (
                  <Badge variant="secondary" key={id}>
                    {subjects.data?.find((s) => s.id === id)?.name || id}
                  </Badge>
                ))}
                {!!t.demo && <Badge variant="outline">Hồ sơ mẫu</Badge>}
                {t.cv && (
                  <Badge variant="outline">
                    <FileText size={12} />
                    Có CV
                  </Badge>
                )}
              </div>
              <div className="tutor-facts">
                <span>
                  {t.levels.join(" · ") || "Cấp học: trao đổi với gia sư"}
                </span>
                <span>
                  <GraduationCap size={16} />
                  {t.experience} năm kinh nghiệm
                </span>
                <span>
                  <MapPin size={16} />
                  {t.location} ·{" "}
                  {t.mode === "online"
                    ? "Online"
                    : t.mode === "both"
                      ? "Online & trực tiếp"
                      : "Trực tiếp"}
                </span>
                <span>
                  <Star size={16} />
                  {t.review_count
                    ? `${t.rating.toFixed(1)} · ${t.review_count} đánh giá`
                    : "Chưa có đánh giá"}
                </span>
              </div>
              <div className="tutor-card-footer">
                <span>
                  <strong>{money(t.rate)}</strong>
                  <small> / giờ</small>
                </span>
                <Button asChild>
                  <Link to={`/tutors/${t.user_id}`}>
                    Xem hồ sơ
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Page>
  );
}
