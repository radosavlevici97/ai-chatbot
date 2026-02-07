"use client";

import type { ConversationListItem } from "@chatbot/shared";
import { ConversationItem } from "./conversation-item";
import { SidebarSkeleton } from "./sidebar-skeleton";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  conversations: ConversationListItem[];
  activeId?: string;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

function groupByDate(conversations: ConversationListItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);

  const groups: { label: string; items: ConversationListItem[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Last 30 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    if (date >= today) groups[0].items.push(conv);
    else if (date >= yesterday) groups[1].items.push(conv);
    else if (date >= weekAgo) groups[2].items.push(conv);
    else if (date >= monthAgo) groups[3].items.push(conv);
    else groups[4].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ConversationList({
  conversations,
  activeId,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex-1">
        <SidebarSkeleton />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  const groups = groupByDate(conversations);

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
            />
          ))}
        </div>
      ))}

      {hasNextPage && (
        <div className="px-2 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </nav>
  );
}
