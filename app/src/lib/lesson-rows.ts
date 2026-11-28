import type { ClassSession } from "@/lib/types";

// The server sends one row per (lesson, student). A tutor looks at one lesson as a whole.
export type LessonStudent = {
  student_id: number | null; student_name: string | null; outcome: ClassSession["outcome"];
  tutor_confirmed_at: string | null; student_confirmed_at: string | null;
};
export type TutorLesson = ClassSession & { students: LessonStudent[] };

// One entry per lesson for the tutor, in the order lessons first appear. The representative row is the one the
// tutor can still act on: a student still pending whom the tutor has not confirmed yet, else any pending
// student, else the first row. Keeping just the first row (the old way) hid the confirm button for everyone
// as soon as the first student had cancelled.
export function tutorLessons(rows: ClassSession[]): TutorLesson[] {
  const byId = new Map<number, ClassSession[]>();
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) || []), r]);
  return [...byId.values()].map((group) => {
    const pick = group.find((r) => r.outcome === "pending" && !r.tutor_confirmed_at)
      || group.find((r) => r.outcome === "pending")
      || group[0];
    return {
      ...pick,
      students: group.filter((r) => r.member_id).map(({ student_id, student_name, outcome, tutor_confirmed_at, student_confirmed_at }) => ({ student_id, student_name, outcome, tutor_confirmed_at, student_confirmed_at })),
    };
  });
}
