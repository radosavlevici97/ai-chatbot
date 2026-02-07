"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useRenameConversation, useDeleteConversation } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@chatbot/shared";

type Props = {
  conversation: ConversationListItem;
  isActive: boolean;
};

export function ConversationItem({ conversation, isActive }: Props) {
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMutation = useRenameConversation();
  const deleteMutation = useDeleteConversation();

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const handleRename = async () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conversation.title) {
      await renameMutation.mutateAsync({ id: conversation.id, title: trimmed });
    }
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(conversation.id);
    if (isActive) router.push("/");
  };

  if (isRenaming) {
    return (
      <div className="px-2 py-1">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted",
        isActive && "bg-muted font-medium",
      )}
    >
      <Link
        href={`/c/${conversation.id}`}
        className="flex flex-1 items-center gap-2 truncate"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {conversation.title ?? "Untitled"}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsRenaming(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
