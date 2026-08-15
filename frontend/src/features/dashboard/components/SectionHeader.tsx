import { Link } from "react-router";

interface SectionHeaderProps {
  title: string;
  /** "See All" destination. Omitted → no link. */
  seeAllTo?: string;
}

export function SectionHeader({ title, seeAllTo }: SectionHeaderProps) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2">
      <h2 className="text-base leading-5 font-semibold tracking-tight">{title}</h2>
      {seeAllTo && (
        <Link
          to={seeAllTo}
          className="text-primary -my-2 -mr-2 flex min-h-10 items-center px-2 text-sm font-medium"
        >
          See All
        </Link>
      )}
    </div>
  );
}
