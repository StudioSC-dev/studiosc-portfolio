interface PageHeaderProps {
  title: string;
  lead: string;
  /**
   * Draw the closing hairline. Turn off when the next section brings its own
   * top border, otherwise the two rules stack with an empty band between them.
   */
  divider?: boolean;
}

/**
 * Shared page masthead, as the page boards draw it: the display title and
 * the lead under it, with no eyebrow above the title.
 */
export default function PageHeader({
  title,
  lead,
  divider = true,
}: PageHeaderProps) {
  return (
    <header
      data-page-header
      className={divider ? "mb-12 border-b border-rule pb-12" : "pb-4"}
    >
      <h1 className="m-0 text-display-phone font-semibold md:text-display">
        {title}
      </h1>
      <p className="mt-5 mb-0 max-w-[40rem] text-lead">{lead}</p>
    </header>
  );
}
