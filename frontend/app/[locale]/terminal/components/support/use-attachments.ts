"use client";

/**
 * A tray of files on their way up.
 *
 * Shared by the wizard and the reply composer because attaching a screenshot
 * to a new ticket and attaching one to a reply are the same act, and the two
 * had drifted in the panel this replaces: the composer silently ignored an
 * unsupported file while the form showed an error, and neither accepted more
 * than one at a time or a paste from the clipboard.
 *
 * Uploads start the moment a file is chosen rather than on send. A person who
 * has attached three screenshots and typed a paragraph should not then wait on
 * three uploads with the send button dead — by then they have finished
 * thinking and the wait is pure latency. Each entry carries its own `uploading`
 * flag so the tray can show what has landed.
 */

import { useCallback, useRef, useState } from "react";
import {
  MAX_ATTACHMENT_BYTES,
  fileNameOf,
  isImageUrl,
  rejectionFor,
  uploadAttachment,
} from "./use-tickets";

export interface TrayItem {
  id: string;
  name: string;
  /** A local object URL while uploading, the stored URL afterwards. */
  preview: string;
  url: string | null;
  isImage: boolean;
  uploading: boolean;
}

let seq = 0;

export function useAttachments() {
  const [items, setItems] = useState<TrayItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  /* Object URLs are revoked on removal and on clear; held here rather than on
     the item so a clear can release them all without reading state that the
     same tick is about to replace. */
  const objectUrls = useRef(new Map<string, string>());

  const release = useCallback((id: string) => {
    const url = objectUrls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(id);
    }
  }, []);

  const add = useCallback(
    async (files: FileList | File[] | null) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      setError(null);

      for (const file of list) {
        const rejection = rejectionFor(file);
        if (rejection) {
          setError(rejection);
          continue;
        }

        const id = `att-${Date.now()}-${++seq}`;
        const isImage = file.type.startsWith("image/");
        /* A local preview so the thumbnail is there before the round trip. A
           PDF has nothing to preview, so it goes straight to the file tile. */
        const preview = isImage ? URL.createObjectURL(file) : "";
        if (preview) objectUrls.current.set(id, preview);

        setItems((prev) => [
          ...prev,
          { id, name: file.name, preview, url: null, isImage, uploading: true },
        ]);

        const url = await uploadAttachment(file);
        if (!url) {
          setError(`${file.name} could not be uploaded. Try again.`);
          release(id);
          setItems((prev) => prev.filter((i) => i.id !== id));
          continue;
        }

        setItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, url, uploading: false, isImage: isImageUrl(url), name: fileNameOf(url) || i.name }
              : i
          )
        );
      }
    },
    [release]
  );

  const remove = useCallback(
    (id: string) => {
      release(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [release]
  );

  const clear = useCallback(() => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setItems([]);
    setError(null);
  }, []);

  /**
   * Images out of a clipboard paste, and nothing else.
   *
   * A paste carrying text as well as an image — copying a region out of a
   * document, say — must not swallow the text: the caller only calls this when
   * the clipboard has files on it, and it returns whether it took them so the
   * caller knows whether to let the paste through to the textarea.
   */
  const takePastedFiles = useCallback(
    (data: DataTransfer | null) => {
      const files = Array.from(data?.files || []);
      if (!files.length) return false;
      void add(files);
      return true;
    },
    [add]
  );

  return {
    items,
    /** Only what has finished uploading, in the order it was added. */
    urls: items.filter((i) => i.url).map((i) => i.url as string),
    busy: items.some((i) => i.uploading),
    error,
    setError,
    add,
    remove,
    clear,
    takePastedFiles,
    maxBytes: MAX_ATTACHMENT_BYTES,
  };
}
