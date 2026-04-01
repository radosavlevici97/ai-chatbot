"use client";

import { useState } from "react";
import { Link2, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="https://github.com/owner/repo"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          disabled={connectMutation.isPending}
          className="pl-9"
        />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={!value.trim() || connectMutation.isPending}
        size="default"
      >
        {connectMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Connect
            <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
