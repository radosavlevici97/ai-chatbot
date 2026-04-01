"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Plus, PanelLeftClose, PanelLeftOpen, FileText, X, Code2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";
import { useConversations } from "@/hooks/use-conversations";
import { ConversationList } from "./conversation-list";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "./user-menu";
import { useMediaQuery } from "@/hooks/use-media-query";

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

  // Determine if we're already on the new-chat page
  const isOnNewChat = pathname === "/" || pathname === "";

  const handleNewChat = () => {
    if (isOnNewChat) return;
    useChatStore.getState().clearMessages();
    router.push("/");
    if (isMobile) setSidebarOpen(false);
  };

  const activeId = pathname.split("/c/")[1];

  // On mobile, sidebar is only shown as overlay (controlled by MobileHeader)
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
            activeId={activeId}
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
        activeId={activeId}
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
  activeId?: string;
  onNewChat: () => void;
  onClose: () => void;
  onToggle: () => void;
  isNewChatDisabled: boolean;
  isMobile: boolean;
};

function SidebarContent({
  activeId,
  onNewChat,
  onClose,
  onToggle,
  isNewChatDisabled,
  isMobile,
}: SidebarContentProps) {
  const router = useRouter();
  const { sidebarTab, setSidebarTab } = useUIStore();

  const activeQuery = useConversations(sidebarTab);
  const conversations = activeQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const handleNewAction = () => {
    if (sidebarTab === "chat") {
      onNewChat();
    } else {
      router.push("/devbot");
    }
  };

  return (
    <>
      {/* Header */}
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

        {/* Tab buttons + New button */}
        <div className="flex items-center gap-1">
          <Button
            variant={sidebarTab === "chat" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => setSidebarTab("chat")}
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" />
            Chat
          </Button>
          <Button
            variant={sidebarTab === "devbot" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => setSidebarTab("devbot")}
          >
            <Code2 className="mr-1 h-3.5 w-3.5" />
            Dev
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleNewAction}
            disabled={sidebarTab === "chat" && isNewChatDisabled}
            title={sidebarTab === "chat" ? "New chat" : "New DevBot session"}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conversation list for active tab */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          isLoading={activeQuery.isLoading}
          hasNextPage={activeQuery.hasNextPage ?? false}
          isFetchingNextPage={activeQuery.isFetchingNextPage}
          onLoadMore={() => activeQuery.fetchNextPage()}
        />
      </div>

      {/* Footer */}
      <div className="border-t p-2">
        <Link
          href="/documents"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <FileText className="h-4 w-4" />
          Documents
        </Link>
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
