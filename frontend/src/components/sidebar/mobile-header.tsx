"use client";

import { Menu, Plus } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useChatStore } from "@/stores/chat-store";

export function MobileHeader() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { setSidebarOpen } = useUIStore();
  const router = useRouter();
  const pathname = usePathname();

  if (!isMobile) return null;

  const isOnNewChat = pathname === "/" || pathname === "";

  const handleNewChat = () => {
    if (isOnNewChat) return;
    useChatStore.getState().clearMessages();
    router.push("/");
  };

  return (
    <div className="flex items-center justify-between border-b bg-background px-3 py-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-medium">AI Chatbot</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleNewChat}
        disabled={isOnNewChat}
        aria-label="New chat"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
