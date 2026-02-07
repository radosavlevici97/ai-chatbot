"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Square, ImageIcon } from "lucide-react";
import { RagToggle } from "./rag-toggle";
import { ImagePreview } from "./image-preview";
import { prepareImage } from "@/lib/image-utils";
import { IMAGE_LIMITS } from "@chatbot/shared";

type ChatInputProps = {
  onSend: (message: string, images: File[], options?: { useDocuments?: boolean }) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  uploadProgress: number;
  isUploading: boolean;
};

export function ChatInput({
  onSend,
  onStop,
  isGenerating,
  disabled,
  uploadProgress,
  isUploading,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [useDocuments, setUseDocuments] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > IMAGE_LIMITS.maxSizeBytes) return;

    const prepared = await prepareImage(file);
    setImages((prev) => {
      if (prev.length >= IMAGE_LIMITS.maxImagesPerMessage) return prev;
      return [...prev, prepared];
    });
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) await addImage(file);
      }
    },
    [addImage],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      for (const file of files) {
        await addImage(file);
      }
    },
    [addImage],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const file of files) {
        await addImage(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [addImage],
  );

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && images.length === 0) return;
    if (isGenerating || isUploading) return;
    onSend(trimmed, images, { useDocuments });
    setInput("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  const isBusy = isGenerating || isUploading;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background p-4"
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
    >
      {/* Upload progress bar */}
      {isUploading && (
        <div className="mb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="mb-2 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
          Drop images here
        </div>
      )}

      {/* Image previews */}
      <ImagePreview images={images} onRemove={removeImage} />

      <div className="mb-2">
        <RagToggle checked={useDocuments} onChange={setUseDocuments} />
      </div>
      <div className="flex items-end gap-2">
        {/* Image upload button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          title="Upload images"
        >
          <ImageIcon className="h-5 w-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={images.length > 0 ? "Ask about this image..." : "Send a message..."}
          disabled={disabled || isBusy}
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isGenerating ? (
          <Button type="button" variant="destructive" size="icon" onClick={onStop}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && images.length === 0) || disabled || isBusy}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
