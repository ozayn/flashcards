"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FLASHCARD_IMAGE_MAX_BYTES,
  uploadFlashcardImage,
} from "@/lib/api";
import { FlashcardCardImage } from "@/components/flashcard-card-image";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp";

type FlashcardImageFieldProps = {
  value: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function FlashcardImageField({
  value,
  onChange,
  disabled = false,
  idPrefix = "card-image",
}: FlashcardImageFieldProps) {
  const reactId = useId();
  const inputId = `${idPrefix}-${reactId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pickFile = () => {
    if (disabled || uploading) return;
    setLocalError(null);
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLocalError(null);
    if (file.size > FLASHCARD_IMAGE_MAX_BYTES) {
      setLocalError("Image is too large. Maximum upload size is 8 MB.");
      return;
    }
    const t = (file.type || "").toLowerCase();
    if (
      t &&
      !/^image\/(jpeg|png|gif|webp)$/.test(t) &&
      t !== "image/jpg"
    ) {
      setLocalError("Use JPEG, PNG, GIF, or WebP");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadFlashcardImage(file);
      onChange(url);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to upload image"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          Image{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(e) => void onFile(e)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8"
            disabled={disabled || uploading}
            onClick={pickFile}
          >
            {uploading ? "Uploading…" : value ? "Replace image" : "Add image"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {value ? (
        <div
          className={cn(
            "rounded-lg border border-border/60 bg-muted/10 p-2",
            (disabled || uploading) && "opacity-60"
          )}
        >
          <FlashcardCardImage imageUrl={value} size="md" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, GIF, or WebP · max 8 MB upload. Images are resized and optimized
          automatically.
        </p>
      )}
      {localError ? (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
