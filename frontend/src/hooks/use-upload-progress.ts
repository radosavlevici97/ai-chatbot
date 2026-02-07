"use client";

import { useState, useCallback, useRef } from "react";

type UploadState = {
  progress: number;
  isUploading: boolean;
  error: string | null;
};

type UploadOptions = {
  url: string;
  formData: FormData;
  onSSEResponse: (response: Response) => void;
};

export function useUploadProgress() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    isUploading: false,
    error: null,
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(({ url, formData, onSSEResponse }: UploadOptions) => {
    setState({ progress: 0, isUploading: true, error: null });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setState((prev) => ({ ...prev, progress: percent }));
      }
    });

    xhr.addEventListener("load", () => {
      setState((prev) => ({ ...prev, isUploading: false, progress: 100 }));

      const responseBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(xhr.responseText));
          controller.close();
        },
      });

      const response = new Response(responseBody, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new Headers({
          "Content-Type": xhr.getResponseHeader("Content-Type") ?? "text/event-stream",
        }),
      });

      onSSEResponse(response);
    });

    xhr.addEventListener("error", () => {
      setState({ progress: 0, isUploading: false, error: "Upload failed. Check your connection." });
    });

    xhr.addEventListener("abort", () => {
      setState({ progress: 0, isUploading: false, error: null });
    });

    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send(formData);
  }, []);

  const abort = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
  }, []);

  return { ...state, upload, abort };
}
