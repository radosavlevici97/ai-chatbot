"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useConnectRepo } from "@/hooks/use-devbot";
import { toast } from "sonner";

export function PasteRepoBar() {
  const [value, setValue] = useState("");
  const connectMutation = useConnectRepo();

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    try {
      await connectMutation.mutateAsync({ repoUrl: trimmed });
      setValue("");
      toast.success("Repo connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Can't access this repo. Check your token permissions.";
      toast.error(msg);
    }
  };

  return (
    <div className="relative">
      <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Paste a repo URL or owner/repo..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        disabled={connectMutation.isPending}
        className="pl-9 pr-10"
      />
      {connectMutation.isPending && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
