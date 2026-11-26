import { STATUSES, type ProjectStatus } from "@/lib/statuses";

interface StatusTextProps {
  status: ProjectStatus;
  /** Size and weight from the caller; the colour is always the text's own. */
  className?: string;
}

/**
 * A project's status, as the boards draw it: the word from the fixed set in
 * `lib/statuses.ts` and nothing else. No dot, and no colour per status.
 */
export default function StatusText({ status, className }: StatusTextProps) {
  return (
    <span data-status={status} className={className}>
      {STATUSES[status].label}
    </span>
  );
}
