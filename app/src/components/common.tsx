import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Slide } from "@animate-ui/react/primitives/effects/slide";
import { ArrowUpRight, BookOpen, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "./ui/empty";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription } from "./ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { statusNames } from "@/lib/api";
export function Page({ children }: { children: ReactNode }) {
  return (
    <Slide className="page" direction="up" offset={16}>
      {children}
    </Slide>
  );
}
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Person({
  name,
  id = 0,
  large = false,
  src,
}: {
  name: string;
  id?: number;
  large?: boolean;
  src?: string;
}) {
  return (
    <Avatar className={large ? "person large" : "person"} data-tone={id % 5}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback>
        {name
          .split(" ")
          .slice(-2)
          .map((s) => s[0])
          .join("")}
      </AvatarFallback>
    </Avatar>
  );
}
export function State({ value }: { value: string }) {
  return (
    <Badge variant="secondary" className={`state state-${value}`}>
      {statusNames[value] || value}
    </Badge>
  );
}
export function Choose({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || "__all"}
        onValueChange={(s) => onChange(s === "__all" ? "" : s)}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {allLabel && <SelectItem value="__all">{allLabel}</SelectItem>}
            {options.map((o) => (
              <SelectItem value={o.value} key={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
export function Blank({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function Loading() {
  return (
    <div aria-label="Đang tải" role="status" className="loading-stack">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {error}
        {retry && (
          <Button variant="outline" onClick={retry}>
            Thử lại
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function Submit({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button disabled={busy || disabled} type="submit">
      {busy && (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      )}
      {children}
    </Button>
  );
}
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
