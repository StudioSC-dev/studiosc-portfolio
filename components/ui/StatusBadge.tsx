import { STATUSES, type ProjectStatus } from "@/lib/statuses";

interface StatusBadgeProps {
  status: ProjectStatus;
}

const DOTS: Record<ProjectStatus, string> = {
  live: "bg-ok",
  "in-qa": "bg-warn",
  "in-development": "bg-info",
  "tested-by-us": "bg-ok",
};

/**
 * Project status, rendered as a dot plus a mono label.
 *
 * Deliberately not a filled/tinted pill: the old glowing `bg-*-500/10` badges
 * were the loudest thing on a project card and pulled focus from the title.
 * The words come from the fixed set in `lib/statuses.ts`.
 */
export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className="label flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span
        className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`}
        aria-hidden
      />
      {STATUSES[status].label}
    </span>
  );
}
