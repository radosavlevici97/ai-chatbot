import { cn } from "@/lib/utils";

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 max-w-[60%] space-y-2">
            <div className="h-4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
