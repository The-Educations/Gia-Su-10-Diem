import { useSearchParams, Link } from "react-router-dom";
import {
  Search,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  ExternalLink,
} from "lucide-react";
import { useLoad, fold } from "@/lib/api";
import type { Subject, Resource } from "@/lib/types";
import {
  Page,
  Heading,
  Choose,
  Blank,
  Loading,
  ErrorState,
} from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export default function Library() {
  const [params, setParams] = useSearchParams(),
    subjects = useLoad<Subject[]>("/subjects"),
    resources = useLoad<Resource[]>("/resources");
  const tab = params.get("tab") || "subjects",
    q = params.get("q") || "",
    category = params.get("category") || "";
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    setParams(p, { replace: true });
  };
  const exams = (resources.data || []).filter(
    (r) =>
      (!q || fold(r.title + " " + r.category).includes(fold(q))) &&
      (!category || r.category === category),
  );
  const courses = (subjects.data || []).filter((s) =>
    fold(s.name + " " + s.stage).includes(fold(q)),
  );
  return (
    <Page>
      <Heading title="Môn học & kỳ thi" />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setParams({ tab: v });
        }}
      >
        <TabsList>
          <TabsTrigger value="subjects">
            <BookOpen size={16} />
            Môn học
          </TabsTrigger>
          <TabsTrigger value="exams">
            <GraduationCap size={16} />
            Mục tiêu kỳ thi
          </TabsTrigger>
        </TabsList>
        <div className="search-panel">
          <Field>
            <FieldLabel htmlFor="catalog-search" className="sr-only">
              Tìm môn học hoặc kỳ thi
            </FieldLabel>
            <div className="search-input">
              <Search size={18} />
              <Input
                id="catalog-search"
                value={q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="Tìm môn học, cấp học hoặc kỳ thi…"
              />
            </div>
          </Field>
        </div>
        <TabsContent value="subjects">
          <div className="subjects-heading">
            <h2>{courses.length} nhóm môn học</h2>
          </div>
          {subjects.loading ? (
            <Loading />
          ) : subjects.error ? (
            <ErrorState error={subjects.error} />
          ) : !courses.length ? (
            <Blank title="Chưa tìm thấy môn học" />
          ) : (
            <div className="subjects-grid">
              {courses.map((s, i) => (
                <article className="subject-card" key={s.id}>
                  <span className="subject-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className="muted">{s.stage}</span>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="subject-actions">
                      <Link to={`/tutors?subject=${s.id}`}>
                        Tìm gia sư
                        <ArrowUpRight size={15} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="exams">
          <div className="list-toolbar">
            <span>{exams.length} nguồn thông tin kỳ thi</span>
            <Choose
              label="Nhóm kỳ thi"
              value={category}
              onChange={(v) => set("category", v)}
              allLabel="Tất cả"
              options={[...new Set(resources.data?.map((r) => r.category))].map(
                (c) => ({ value: c, label: c }),
              )}
            />
          </div>
          {resources.loading ? (
            <Loading />
          ) : resources.error ? (
            <ErrorState error={resources.error} />
          ) : !exams.length ? (
            <Blank title="Chưa có kỳ thi phù hợp" />
          ) : (
            <div className="resource-list">
              {exams.map((r, i) => (
                <article className="resource-row" key={r.id}>
                  <div className="resource-spine" data-tone={i % 3}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <GraduationCap size={24} />
                  </div>
                  <div className="resource-info">
                    <Badge variant="secondary">{r.category}</Badge>
                    <h3>{r.title}</h3>
                    <p>
                      {r.level} · {r.source_name}
                    </p>
                  </div>
                  <div className="resource-action">
                    <Button asChild>
                      <Link
                        to={`/tutors?goal=${encodeURIComponent(r.category)}`}
                      >
                        Tìm gia sư
                        <ArrowUpRight data-icon="inline-end" />
                      </Link>
                    </Button>
                    <a
                      className="text-link"
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Thông tin kỳ thi
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="catalog-note">
            Danh mục định hướng tìm gia sư. Lịch và điều kiện thi xem tại đơn vị
            tổ chức.
          </p>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
