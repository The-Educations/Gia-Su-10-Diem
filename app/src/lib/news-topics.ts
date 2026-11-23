import topics from "../../../shared/news-topics.json";
import type { NewsTopic } from "./types";

// One list of topics for server and app: shared/news-topics.json.
export const NEWS_TOPICS = topics as { id: NewsTopic; label: string; description: string; cta: { heading: string; button: string } }[];
export const isNewsTopic = (value: unknown): value is NewsTopic => NEWS_TOPICS.some((topic) => topic.id === value);
export const topicLabel = (id: string) => NEWS_TOPICS.find((topic) => topic.id === id)?.label ?? "Tin tức";
