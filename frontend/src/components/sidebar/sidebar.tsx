"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, PanelLeftClose, PanelLeftOpen, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";
import { useConversations } from "@/hooks/use-conversations";
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

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile, setSidebarOpen]);

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversations();

  const conversations = data?.pages.flatMap((page) => page.data) ?? [];

  // Determine if we're already on the new-chat page
  const isOnNewChat = pathname === "/" || pathname === "";

  const handleNewChat = () => {
    if (isOnNewChat) return;

    // Clear chat store so the new-chat page starts fresh
    useChatStore.getState().clearMessages();

    router.push("/");
    if (isMobile) setSidebarOpen(false);
  };

  // On mobile, sidebar is only shown as overlay (controlled by MobileHeader)
  // No collapsed toggle bar needed on mobile
  if (isMobile) {
    if (!sidebarOpen) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
        <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-background shadow-lg pb-safe">
          <SidebarContent
            conversations={conversations}
            isLoading={isLoading}
            activeId={pathname.split("/c/")[1]}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            onNewChat={handleNewChat}
            onClose={() => setSidebarOpen(false)}
            onToggle={toggleSidebar}
            isNewChatDisabled={isOnNewChat}
            isMobile={true}
          />
        </aside>
      </>
    );
  }

  // Desktop: collapsed state shows toggle button
  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center p-2 border-r">
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <PanelLeftOpen className="h-5 w-5" />
        </Button>
      </div>
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
        onClose={() => setSidebarOpen(false)}
        onToggle={toggleSidebar}
        isNewChatDisabled={isOnNewChat}
        isMobile={false}
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
  onClose: () => void;
  onToggle: () => void;
  isNewChatDisabled: boolean;
  isMobile: boolean;
};

function SidebarContent({
  conversations,
  isLoading,
  activeId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onNewChat,
  onClose,
  onToggle,
  isNewChatDisabled,
  isMobile,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center justify-between p-3">
        {isMobile ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <PanelLeftClose className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          disabled={isNewChatDisabled}
        >
          <Plus className="mr-1 h-4 w-4" />
          New chat
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
