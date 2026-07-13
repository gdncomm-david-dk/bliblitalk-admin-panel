export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}
