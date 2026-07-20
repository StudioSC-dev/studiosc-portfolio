interface StatusBadgeProps {
  qaVerified?: boolean;
  qaInProgress?: boolean;
  underDevelopment?: boolean;
}

/**
 * Project status, rendered as a dot plus a mono label.
 *
 * Deliberately not a filled/tinted pill: the old glowing `bg-*-500/10` badges
 * were the loudest thing on a project card and pulled focus from the title.
 * Priority is QA Verified > QA In Progress > Under Development.
 */
export default function StatusBadge({
  qaVerified,
  qaInProgress,
  underDevelopment,
}: StatusBadgeProps) {
  const status = qaVerified
    ? { label: "QA Verified", dot: "bg-ok" }
    : qaInProgress
      ? { label: "QA In Progress", dot: "bg-warn" }
      : underDevelopment
        ? { label: "Under Development", dot: "bg-info" }
        : null;

  if (!status) {
    return null;
  }

  return (
    <span className="label flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
      {status.label}
    </span>
  );
}
