import { TrustLine } from "@/components/trust";
import { TutorLocalTime } from "@/components/tutor-timezone";
import { Collapsible } from "@animate-ui/react/primitives/radix-ui/collapsible";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BadgeCheck,
  Heart,
  MapPin,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, fold, money } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
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
    t = useI18n().t,
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
          : b.trust.sort_score - a.trust.sort_score,
    );
  async function favorite(tr: Tutor) {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (user.role !== "student") {
      toast.info(t("Lưu gia sư dành cho tài khoản học sinh."));
      return;
    }
    setSaving(tr.user_id);
    try {
      await api(
        `/favorites/${tr.user_id}`,
        favorites.data?.includes(tr.user_id) ? "DELETE" : "PUT",
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
        title={favoritesOnly ? t("Gia sư đã lưu") : t("Tìm gia sư")}

      />

      <section className="search-panel" aria-label={t("Bộ lọc gia sư")}>
        <Collapsible.Root open={advanced} onOpenChange={setAdvanced}>
          <div className="search-row">
            <Field>
              <FieldLabel htmlFor="tutor-search" className="sr-only">
                {t("Tìm gia sư")}
              </FieldLabel>
              <div className="search-input">
                <Search size={19} />
                <Input
                  id="tutor-search"
                  placeholder={t("Tên gia sư, trường hoặc từ khóa…")}
                  value={q}
                  onChange={(e) => set("q", e.target.value)}
                />
              </div>
            </Field>
            <Collapsible.Trigger asChild>
              <Button variant="outline" className="advanced-filter-toggle">
                <SlidersHorizontal data-icon="inline-start" />
                <span className="filter-label-wide">{t("Bộ lọc thêm")}</span>
                <span className="filter-label-narrow">{t("Bộ lọc")}</span>
                {(location || goal || level) && (
                  <span
                    className="filter-dot"
                    aria-label={t("Có bộ lọc đang áp dụng")}
                  />
                )}
              </Button>
            </Collapsible.Trigger>
          </div>
          <div className="filter-grid three" data-filled={!!(subject || mode || budget) || undefined}>
            <Choose
              label={t("Môn học")}
              value={subject}
              onChange={(v) => set("subject", v)}
              allLabel={t("Tất cả môn học")}
              options={(subjects.data || []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
            <Choose
              label={t("Hình thức")}
              value={mode}
              onChange={(v) => set("mode", v)}
              allLabel={t("Tất cả hình thức")}
              options={[
                { value: "online", label: t("Trực tuyến") },
                { value: "offline", label: t("Trực tiếp") },
              ]}
            />
            <Choose
              label={t("Học phí / buổi")}
              value={budget}
              onChange={(v) => set("budget", v)}
              allLabel={t("Mọi mức học phí")}
              options={[150000, 200000, 300000].map((n) => ({
                value: String(n),
                label: t("Đến {amount}", { amount: money(n) }),
              }))}
            />
          </div>
          <Collapsible.Content>
            <div className="filter-grid three secondary-filters">
              {" "}
              <Choose
                label={t("Địa điểm")}
                value={location}
                onChange={(v) => set("location", v)}
                allLabel={t("Toàn quốc")}
                options={[...new Set(tutors.data?.map((t) => t.location))].map(
                  (l) => ({ value: l, label: l }),
                )}
              />
              <Choose
                label={t("Cấp học")}
                value={level}
                onChange={(v) => set("level", v)}
                allLabel={t("Tất cả cấp học")}
                options={["Tiểu học", "THCS", "THPT", "Người đi làm"].map(
                  (v) => ({
                    value: v,
                    label: t(v),
                  }),
                )}
              />
              <Choose
                label={t("Mục tiêu kỳ thi")}
                value={goal}
                onChange={(v) => set("goal", v)}
                allLabel={t("Tất cả mục tiêu")}
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
              {t("Xóa bộ lọc")}
            </Button>
          </div>
        )}
      </section>
      <div className="results-heading" id="tutor-results">
        <h2>
          {t("{count} gia sư", { count: rows.length })}{favoritesOnly ? " " + t("đã lưu") : ""}
        </h2>
        <div className="sort-control">
          <Choose
            label={t("Sắp xếp")}
            value={sort}
            onChange={(v) => set("sort", v)}
            options={[
              { value: "recommended", label: t("Đánh giá cao") },
              { value: "price", label: t("Học phí tăng dần") },
              { value: "experience", label: t("Nhiều kinh nghiệm") },
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
              ? t("Chưa lưu gia sư nào")
              : t("Chưa tìm thấy gia sư phù hợp")
          }
          description={t("Thử môn học hoặc khoảng học phí khác.")}
          action={
            <Button
              variant="outline"
              onClick={() =>
                favoritesOnly ? navigate("/tutors") : setParams({})
              }
            >
              {favoritesOnly ? t("Tìm gia sư") : t("Xóa bộ lọc")}
            </Button>
          }
        />
      ) : (
        <div className="tutor-grid">
          {rows.map((tu) => (
            <article className="tutor-card" data-theme={tu.profile_theme} key={tu.user_id}>
              <div className="tutor-card-top">
                <Person
                  name={tu.name}
                  id={tu.user_id}
                  src={tu.photo_url || undefined}
                  large
                />
                <div className="tutor-identity">
                  <Link to={`/tutors/${tu.user_id}`}>
                    <h3>{tu.name}</h3>
                  </Link>
                  <p>{tu.headline}</p>
                </div>
                {(!user || user.role === "student") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={saving === tu.user_id}
                    onClick={() => favorite(tu)}
                    aria-label={`${favorites.data?.includes(tu.user_id) ? t("Bỏ lưu") : t("Lưu")} ${tu.name}`}
                    aria-pressed={!!favorites.data?.includes(tu.user_id)}
                  >
                    <Heart
                      className={
                        favorites.data?.includes(tu.user_id)
                          ? "heart-filled"
                          : ""
                      }
                    />
                  </Button>
                )}
              </div>
              <div className="subject-tags">
                {tu.subjects.map((id) => (
                  <Badge variant="secondary" key={id}>
                    {subjects.data?.find((s) => s.id === id)?.name || id}
                  </Badge>
                ))}
                {!!tu.verified?.length && <Badge variant="outline" className="verified-badge"><BadgeCheck data-icon="inline-start" />{t("Đã xác minh")}</Badge>}
                {!!tu.demo && <Badge variant="outline">{t("Hồ sơ mẫu")}</Badge>}

              </div>
              <div className="tutor-facts">
                <span>
                  {tu.levels.map(l => t(l)).join(" · ") || t("Cấp học: trao đổi với gia sư")}
                </span>
                <span>
                  <GraduationCap size={16} />
                  {t("{n} năm kinh nghiệm", { n: tu.experience })}
                </span>
                <span>
                  <MapPin size={16} />
                  {tu.location} ·{" "}
                  {tu.mode === "online"
                    ? t("Trực tuyến")
                    : tu.mode === "both"
                      ? t("Trực tuyến & trực tiếp")
                      : t("Trực tiếp")}
                </span>
                <TutorLocalTime zone={tu.timezone} />
                <TrustLine trust={tu.trust} />
              </div>
              <div className="tutor-card-footer">
                <span>
                  <strong>{money(tu.rate)}</strong>
                  <small> {t("/ buổi")}</small>
                </span>
                <Button asChild>
                  <Link to={`/tutors/${tu.user_id}`}>
                    {t("Xem hồ sơ")}
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
