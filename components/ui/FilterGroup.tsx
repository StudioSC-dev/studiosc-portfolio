export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterGroupProps<T extends string> {
  /** The group's accessible name, for example "Filter by status". */
  label: string;
  options: readonly FilterOption<T>[];
  /** The picked option: the one pressed and filled ink. */
  selected: T;
  onSelect?: (value: T) => void;
}

/**
 * A row of pill buttons that filters a list, as the Work and Writing boards
 * draw it: each button is a toggle with `aria-pressed`, and only the picked
 * one is pressed and filled ink. Controlled: the caller keeps the selection
 * (PRV-11 on /work, PRV-14 on /blog/work).
 */
export default function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: FilterGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const pressed = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={onSelect ? () => onSelect(option.value) : undefined}
            className={`min-h-11 cursor-pointer appearance-none rounded-pill border border-ink px-4 text-small font-semibold ${
              pressed ? "bg-ink text-gallery" : "bg-transparent text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
