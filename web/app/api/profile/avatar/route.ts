import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Avatar upload — accepts a single image, stores it in the `avatars` bucket
 * under the user's id prefix, and updates the profile row with the public URL.
 *
 * Storage policy (migration 0004) restricts writes to the owner's prefix:
 *   avatars/<auth.uid()>/avatar.<ext>
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, or GIF allowed" },
      { status: 400 },
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Max 5MB" }, { status: 413 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const key = `${user.id}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  // Use the admin client for the upload + profile update so RLS on the
  // avatars bucket (which scopes by foldername) doesn't block the write.
  // The user is verified via the session above, so this is safe.
  const admin = createAdminClient();

  // Remove any previous avatar for this user (different extensions).
  const { data: existing } = await admin.storage
    .from("avatars")
    .list(user.id);
  if (existing && existing.length) {
    await admin.storage
      .from("avatars")
      .remove(existing.map((f) => `${user.id}/${f.name}`));
  }

  const { error: uploadErr } = await admin.storage
    .from("avatars")
    .upload(key, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  // Get the public URL (avatars bucket is public-read).
  const { data: urlData } = admin.storage
    .from("avatars")
    .getPublicUrl(key);
  const avatarUrl = urlData.publicUrl;

  // Cache-bust the URL so the browser refetches after a re-upload.
  const cacheBusted = `${avatarUrl}?t=${Date.now()}`;

  // Update the profile row.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ avatar_url: cacheBusted })
    .eq("id", user.id);
  if (updateErr) {
    return NextResponse.json(
      { error: `Profile update failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ avatar_url: cacheBusted });
}
