export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-muted animate-pulse" />
      ))}
    </div>
  );
}
