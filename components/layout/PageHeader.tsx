interface PageHeaderProps {
  /** Small mono eyebrow above the title. */
  label: string;
  title: string;
  lead: string;
  /**
   * Draw the closing hairline. Turn off when the next section brings its own
   * top border, otherwise the two rules stack with an empty band between them.
   */
  divider?: boolean;
}

/**
 * Shared page masthead. Left-aligned rather than centred — centred headings
 * over left-aligned body copy was part of what made every page read the same.
 */
export default function PageHeader({
  label,
  title,
  lead,
  divider = true,
}: PageHeaderProps) {
  return (
    <header className={divider ? "mb-12 border-b border-line pb-12" : "pb-4"}>
      <p className="label mb-6">{label}</p>
      <h1 className="font-serif text-5xl leading-[1.05] text-ink sm:text-6xl">
        {title}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">{lead}</p>
    </header>
  );
}
