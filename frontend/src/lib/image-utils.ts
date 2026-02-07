import { IMAGE_LIMITS } from "@chatbot/shared";

/**
 * Resize an image on the client if it exceeds the threshold.
 * Returns the original file if it's small enough.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.size <= IMAGE_LIMITS.clientResizeThresholdBytes) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > IMAGE_LIMITS.maxDimensionPx || height > IMAGE_LIMITS.maxDimensionPx) {
        const ratio = Math.min(
          IMAGE_LIMITS.maxDimensionPx / width,
          IMAGE_LIMITS.maxDimensionPx / height,
        );
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function createThumbnailUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeThumbnailUrl(url: string): void {
  URL.revokeObjectURL(url);
}
