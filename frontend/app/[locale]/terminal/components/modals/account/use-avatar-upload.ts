"use client";

/**
 * Changing the profile photo, shared by the rail and the portrait.
 *
 * It lived inline in the account overlay and was handed down as a prop, which
 * was fine while the avatar appeared once. It now appears twice — small in the
 * rail, large on the profile — and threading the same callback through two
 * component trees is how the two end up with different size limits or a
 * different toast. One hook, called wherever an avatar is clickable.
 *
 * Two ways to change it, because there are two: upload a photograph, or choose
 * one of the drawn avatars. They are both here rather than one here and one at
 * the call site, for the same reason the upload is here at all — otherwise the
 * two paths drift and only one of them tells you it worked.
 */

import { useCallback, useState } from "react";
import { imageUploader } from "@/utils/upload";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";

export function useAvatarUpload() {
  const { user, updateAvatar } = useUserStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const pickPhoto = useCallback(
    async (file: File) => {
      setUploading(true);
      const res = await imageUploader({
        file,
        dir: "avatars",
        size: { maxWidth: 400, maxHeight: 400 },
        oldPath: user?.avatar || "",
      });
      if (res.success && res.url) {
        await updateAvatar(res.url);
        toast({ title: "Photo updated", description: "Your profile picture has been changed." });
      } else {
        toast({
          title: "Upload failed",
          description: "Could not upload that image.",
          variant: "destructive",
        });
      }
      setUploading(false);
    },
    [user?.avatar, updateAvatar, toast]
  );

  /**
   * Choose one of the drawn avatars.
   *
   * No upload: these are static files the app already serves, so the whole
   * change is writing that path into the same column an upload writes to. That
   * is deliberate — every `<img src={user.avatar}>` in the product keeps
   * working without being taught that this feature exists.
   *
   * The previously uploaded file is left where it is. `imageUploader` deletes
   * an old photo when a new one replaces it, and there is no matching call for
   * "stop pointing at it", so deleting here would need an endpoint that does
   * not exist yet. An orphaned file costs storage; a delete written against the
   * wrong path costs somebody their picture.
   */
  const chooseAvatar = useCallback(
    async (url: string) => {
      setUploading(true);
      const ok = await updateAvatar(url);
      toast(
        ok
          ? { title: "Avatar updated", description: "Your profile picture has been changed." }
          : {
              title: "Could not save",
              description: "Your avatar was not changed. Try again.",
              variant: "destructive",
            }
      );
      setUploading(false);
      return ok;
    },
    [updateAvatar, toast]
  );

  return { pickPhoto, chooseAvatar, uploading };
}
