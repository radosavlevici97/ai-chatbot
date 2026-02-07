"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, PanelLeftClose, PanelLeftOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { ConversationList } from "./conversation-list";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "./user-menu";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ConversationListItem } from "@chatbot/shared";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();

  // Auto-close sidebar when transitioning to mobile viewport
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversations();

  const createMutation = useCreateConversation();

  const conversations = data?.pages.flatMap((page) => page.data) ?? [];

  const handleNewChat = async () => {
    const conv = await createMutation.mutateAsync({ model: "gemini-2.5-flash" });
    router.push(`/c/${conv.id}`);
    if (isMobile) setSidebarOpen(false);
  };

  // Collapsed state: show toggle button only
  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center p-2 border-r">
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <PanelLeftOpen className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background shadow-lg">
          <SidebarContent
            conversations={conversations}
            isLoading={isLoading}
            activeId={pathname.split("/c/")[1]}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            onNewChat={handleNewChat}
            onToggle={toggleSidebar}
            isCreating={createMutation.isPending}
          />
        </aside>
      </>
    );
  }

  // Desktop: static sidebar
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/40">
      <SidebarContent
        conversations={conversations}
        isLoading={isLoading}
        activeId={pathname.split("/c/")[1]}
        hasNextPage={hasNextPage ?? false}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        onNewChat={handleNewChat}
        onToggle={toggleSidebar}
        isCreating={createMutation.isPending}
      />
    </aside>
  );
}

// ── Inner content (shared between mobile overlay and desktop) ──

type SidebarContentProps = {
  conversations: ConversationListItem[];
  isLoading: boolean;
  activeId?: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onNewChat: () => void;
  onToggle: () => void;
  isCreating: boolean;
};

function SidebarContent({
  conversations,
  isLoading,
  activeId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onNewChat,
  onToggle,
  isCreating,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center justify-between p-3">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <PanelLeftClose className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          disabled={isCreating}
        >
          <Plus className="mr-1 h-4 w-4" />
          {isCreating ? "Creating..." : "New chat"}
        </Button>
      </div>

      <ConversationList
        conversations={conversations}
        activeId={activeId}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />

      <div className="border-t p-2">
        <a
          href="/documents"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <FileText className="h-4 w-4" />
          Documents
        </a>
      </div>
      <div className="border-t p-2">
        <div className="flex items-center justify-between">
          <UserMenu />
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}
