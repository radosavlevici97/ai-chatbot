"use client";

import { useState } from "react";
import { Wrench, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DiffView } from "./diff-view";
import type { ApprovalRequest } from "@chatbot/shared";

type Props = {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: (reason: string) => void;
  disabled?: boolean;
};

export function ApprovalCard({ approval, onApprove, onReject, disabled }: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const handleReject = () => {
    if (!rejecting) {
      setRejecting(true);
      return;
    }
    onReject(reason.trim() || "Rejected without reason");
    setRejecting(false);
    setReason("");
  };

  return (
    <Card className="my-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Wrench className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Proposed Fix</span>
      </div>

      {/* Description */}
      <div className="px-4 py-3">
        <p className="text-sm">{approval.fixDescription}</p>
      </div>

      {/* Diffs */}
      <div className="space-y-2 px-4 pb-3">
        {approval.files.map((file) => (
          <DiffView
            key={file.path}
            path={file.path}
            diff={file.diff}
            defaultOpen={approval.files.length <= 3}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="border-t px-4 py-3">
        {rejecting ? (
          <div className="flex gap-2">
            <Input
              placeholder="Rejection reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleReject();
                if (e.key === "Escape") setRejecting(false);
              }}
              autoFocus
              className="text-sm"
            />
            <Button size="sm" variant="destructive" onClick={handleReject} disabled={disabled}>
              Send
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onApprove}
              disabled={disabled}
              className="flex-1"
            >
              <Check className="mr-1.5 h-4 w-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={disabled}
              className="flex-1"
            >
              <X className="mr-1.5 h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
