"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createThumbnailUrl, revokeThumbnailUrl } from "@/lib/image-utils";

type Props = {
  images: File[];
  onRemove: (index: number) => void;
};

export function ImagePreview({ images, onRemove }: Props) {
  const urlMapRef = useRef<Map<File, string>>(new Map());

  function getUrl(file: File): string {
    const existing = urlMapRef.current.get(file);
    if (existing) return existing;
    const url = createThumbnailUrl(file);
    urlMapRef.current.set(file, url);
    return url;
  }

  useEffect(() => {
    const currentMap = urlMapRef.current;

    return () => {
      for (const url of currentMap.values()) {
        revokeThumbnailUrl(url);
      }
      currentMap.clear();
    };
  }, [images]);

  const handleRemove = (index: number) => {
    const file = images[index];
    const url = urlMapRef.current.get(file);
    if (url) {
      revokeThumbnailUrl(url);
      urlMapRef.current.delete(file);
    }
    onRemove(index);
  };

  if (images.length === 0) return null;

  return (
    <div className="mb-2 flex gap-2 overflow-x-auto">
      {images.map((file, i) => (
        <div key={`${file.name}-${file.size}-${i}`} className="group relative h-20 w-20 flex-shrink-0">
          <img
            src={getUrl(file)}
            alt={file.name}
            className="h-full w-full rounded-lg border object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-1 -top-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleRemove(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
