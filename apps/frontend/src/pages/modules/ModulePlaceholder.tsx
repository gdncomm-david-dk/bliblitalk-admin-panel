interface ModulePlaceholderProps {
  title: string;
  description: string;
}

/** Empty module shell used by every Admin CMS route until Phase 6 fills it in. */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div>
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-6 flex h-64 items-center justify-center rounded-2xl border border-dashed border-line bg-white">
        <div className="text-center">
          <p className="text-sm font-semibold text-muted">Coming in Phase 6</p>
          <p className="mt-1 text-xs text-muted">This module is scaffolded but not yet built.</p>
        </div>
      </div>
    </div>
  );
}
