import { Link } from "react-router";

interface SectionHeaderProps {
  title: string;
  /** "See All" destination. Omitted → no link. */
  seeAllTo?: string;
}

export function SectionHeader({ title, seeAllTo }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base leading-5 font-semibold tracking-tight">{title}</h2>
      {seeAllTo && (
        <Link to={seeAllTo} className="text-primary text-sm font-medium">
          See All
        </Link>
      )}
    </div>
  );
}
