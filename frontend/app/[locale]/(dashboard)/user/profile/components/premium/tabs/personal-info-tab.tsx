"use client";

/**
 * Personal information.
 *
 * ── Why typing was broken ─────────────────────────────────────────────────
 * The previous version declared its field components — IconInput, CardHeader,
 * SaveButton — INSIDE the component body. A function declared there has a new
 * identity on every render, so React does not see the same component in the
 * same position; it sees a different type, unmounts the old subtree and mounts
 * a new one. The `<input>` DOM node was therefore destroyed and recreated after
 * every keystroke, which is precisely the reported symptom: one character
 * lands, the field empties and loses focus, and you have to click back in for
 * the next one. Nothing about the form's data was wrong — the input could not
 * survive being typed into.
 *
 * Everything below is declared at module scope, so a field is the same element
 * across renders and keeps its focus, its selection and its cursor position.
 *
 * ── Everything else ───────────────────────────────────────────────────────
 * Built on the settings kit, so all three themes come from semantic tokens
 * rather than hardcoded zinc — which is why the buttons did not match the dark
 * theme before. Quick actions and the security checklist have moved here from
 * the overview, where they sat beside a dashboard rather than beside the fields
 * they concern. The checklist reports four real flags from the account and
 * nothing else.
 */

import { memo, useRef, useState } from "react";
import { toE164 } from "@/components/ui/phone-input";
import {
  User as UserIcon,
  MapPin,
  Camera,
  Copy,
  KeyRound,
  Loader2,
  Check,
  AlertTriangle,
  ShieldCheck,
  Mail,
  Phone,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { imageUploader } from "@/utils/upload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CountrySelect } from "@/components/ui/country-select";
import { useKycState } from "@/app/[locale]/terminal/components/modals/account/kyc/use-kyc-state";
import { StateSelect } from "@/components/ui/state-select";
import { CitySelect } from "@/components/ui/city-select";
import {
  SettingsPage,
  Card,
  Field,
  Row,
  Action,
  Divider,
  inputClass,
} from "../../kit/settings-kit";

/* ── module-scope pieces ──────────────────────────────────────────────────
   Declared here, not inside the component. See the note at the top: this is
   the entire reason the form could not be typed into. */

const TextField = memo(function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  autoComplete,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
});

const ChecklistRow = memo(function ChecklistRow({
  icon: Icon,
  label,
  done,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  done: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className={
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg border " +
          (done
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-border bg-muted text-muted-foreground")
        }
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{done ? "Complete" : hint}</p>
      </div>
      {done ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      )}
    </div>
  );
});

/* ── page ─────────────────────────────────────────────────────────────────── */

export const PersonalInfoTab = memo(function PersonalInfoTab({
  onTabChange,
}: {
  onTabChange?: (tab: string) => void;
}) {
  const { user, updateUser, updateAvatar } = useUserStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const readProfile = () => {
    const src: any =
      typeof user?.profile === "string" ? safeParse(user.profile) : user?.profile || {};
    return {
      ...src,
      location: {
        address: src.location?.address || "",
        city: src.location?.city || "",
        state: src.location?.state || "",
        country: src.location?.country || "",
        countryCode:
          src.location?.countryCode ||
          // Older profiles put the iso2 in `country`. A two-letter value there
          // is a code, not a country name, so it is usable as one.
          (String(src.location?.country || "").length === 2 ? src.location.country : ""),
        zip: src.location?.zip || "",
      },
    };
  };

  /* The identity locks, read from the newest application. */
  const { verified } = useKycState();

  const [form, setForm] = useState(() => {
    const p = readProfile();
    return {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      location: p.location,
    };
  });

  if (!user) return null;

  /* The phone is write-once from the account side and shut for good once a
     check has passed — the same rule the route applies. */
  const phoneLocked = verified || !!user.phone;

  /* The short number when there is one, the UUID only as a fallback for an
     account that predates the numbering and has not been backfilled. */
  const accountRef = String((user as any).accountId || user.id);

  const initials =
    (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase() +
    (user.lastName?.[0] || "").toUpperCase();

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await imageUploader({
      file,
      dir: "avatars",
      size: { maxWidth: 400, maxHeight: 400 },
      oldPath: user.avatar || "",
    });
    if (res.success && res.url) {
      await updateAvatar(res.url);
      toast({ title: "Photo updated", description: "Your profile picture has been changed." });
    } else {
      toast({ title: "Upload failed", description: "Could not upload that image.", variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  /* One save for the whole form. There were three, one per card, and each
     rebuilt its payload from the SERVER's copy of the profile — so saving any
     one card silently discarded what had been typed into the others while the
     inputs went on showing it. */
  const save = async () => {
    setSaving(true);
    const ok = await updateUser({
      /* Omitted once verified rather than sent and ignored. */
      ...(verified ? {} : { firstName: form.firstName, lastName: form.lastName }),
      /* A plus and digits, and nothing else — the column is checked against
         `^[+0-9]+$`, and this field's own placeholder shows a number with
         spaces in it. The model strips punctuation too; doing it here as well
         means a frontend deploy fixes the save on its own, without waiting for
         the backend that also does it to be restarted. */
      phone: toE164(form.phone),
      profile: { ...readProfile(), location: form.location },
    });
    setSaving(false);
    toast(
      ok
        ? { title: "Saved", description: "Your details have been updated." }
        : { title: "Save failed", description: "Could not update your profile.", variant: "destructive" }
    );
  };

  const emailResetLink = async () => {
    setSendingReset(true);
    const { error } = await $fetch({
      url: "/api/auth/reset",
      method: "POST",
      body: { email: user.email },
      silentSuccess: true,
    });
    setSendingReset(false);
    toast(
      error
        ? { title: "Could not send", description: "Please try again in a moment.", variant: "destructive" }
        : { title: "Reset link sent", description: `Open the link in ${user.email}.` }
    );
  };

  const setLoc = (patch: Partial<typeof form.location>) =>
    setForm((p) => ({ ...p, location: { ...p.location, ...patch } }));

  return (
    <SettingsPage
      title="Personal information"
      description="Your details, and the checks on your account."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="Your details"
            description="The name we show on your statements."
            footer={
              <Action onClick={save} loading={saving}>
                Save changes
              </Action>
            }
          >
            <div className="flex flex-wrap items-center gap-4 pb-5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarImage src={user.avatar || undefined} alt="" />
                  <AvatarFallback className="bg-muted text-sm font-medium text-muted-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute inset-0 grid place-items-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                  ) : (
                    <Camera className="h-4 w-4 text-foreground" />
                  )}
                </span>
              </button>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">Profile photo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PNG or JPG. Click the photo to replace it.
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={uploadAvatar}
              />
            </div>

            <Divider />

            <div className="grid gap-4 pt-5 sm:grid-cols-2">
              {/* Shut once a check has passed, the same as the terminal's own
                  Personal details — the route ignores a name and a phone from a
                  verified account either way, and a field that takes what you
                  type and drops it on the floor is worse than one that says it
                  cannot. See BIDEX_LOCK_WHEN_VERIFIED. */}
              <TextField
                label="First name"
                value={form.firstName}
                onChange={(v) => setForm((p) => ({ ...p, firstName: v }))}
                autoComplete="given-name"
                disabled={verified}
                hint={verified ? "Verified. Contact support to change it." : undefined}
              />
              <TextField
                label="Last name"
                value={form.lastName}
                onChange={(v) => setForm((p) => ({ ...p, lastName: v }))}
                autoComplete="family-name"
                disabled={verified}
              />
              <TextField
                label="Email"
                value={user.email || ""}
                disabled
                hint="To change your email, please contact support."
              />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                disabled={phoneLocked}
                hint={
                  phoneLocked
                    ? "Contact support to change it."
                    : "Verify your phone to use it for withdrawals."
                }
              />
            </div>
          </Card>

          <Card
            title="Location"
            description="We use this on your withdrawal records."
            footer={
              <Action onClick={save} loading={saving}>
                Save changes
              </Action>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country">
                <CountrySelect
                  value={form.location.countryCode}
                  onValueChange={(iso2) =>
                    // Changing the country invalidates the state and the city
                    // under it, so both are cleared rather than left pointing at
                    // a place that is no longer in the selected country.
                    setLoc({ country: iso2, countryCode: iso2, state: "", city: "" })
                  }
                />
              </Field>
              <Field label="State or region">
                <StateSelect
                  countryCode={form.location.countryCode}
                  value={form.location.state}
                  onValueChange={(state) => setLoc({ state, city: "" })}
                  disabled={!form.location.countryCode}
                />
              </Field>
              <Field label="City">
                <CitySelect
                  countryCode={form.location.countryCode}
                  stateName={form.location.state}
                  value={form.location.city}
                  onValueChange={(city) => setLoc({ city })}
                  disabled={!form.location.state}
                />
              </Field>
              <TextField
                label="Postcode"
                value={form.location.zip}
                onChange={(v) => setLoc({ zip: v })}
                autoComplete="postal-code"
              />
              <Field label="Street address" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={form.location.address}
                  onChange={(e) => setLoc({ address: e.target.value })}
                  placeholder="Street, apartment, suite"
                  autoComplete="street-address"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* Moved here from the overview: these belong beside the fields they
            concern, not beside a dashboard. */}
        <div className="space-y-5">
          <Card
            title="Account checklist"
            description="The four checks on your account."
          >
            <ChecklistRow
              icon={ShieldCheck}
              label="Two-factor authentication"
              done={!!user.twoFactor?.enabled}
              hint="Not enabled"
            />
            <ChecklistRow
              icon={Mail}
              label="Email verified"
              done={!!user.emailVerified}
              hint="Not verified"
            />
            <ChecklistRow
              icon={Phone}
              label="Phone verified"
              done={!!user.phoneVerified}
              hint="Not verified"
            />
            <ChecklistRow
              icon={BadgeCheck}
              label="Identity check"
              done={(user.kycLevel || 0) > 0}
              hint="Not started"
            />
          </Card>

          <Card title="Quick actions">
            <div className="space-y-1">
              <QuickAction label="Security settings" onClick={() => onTabChange?.("security")} />
              <QuickAction label="Phone verification" onClick={() => onTabChange?.("phone-verification")} />
              <QuickAction label="Notifications" onClick={() => onTabChange?.("notifications")} />
            </div>

            <Divider />

            <div className="pt-3">
              <Row
                title="Password"
                description={`We email a secure link to ${user.email}. You stay signed in.`}
                action={
                  <Action variant="secondary" loading={sendingReset} onClick={emailResetLink}>
                    Send link
                  </Action>
                }
              />
            </div>
          </Card>

          {/* The eight-digit number, not the UUID.
          
              `user.id` is still a UUID and always will be — it is the primary
              key and every table that references a user carries it — but 36
              characters of hex is not something anybody reads down a phone
              line to support, which is the entire purpose of this card. An
              account that predates the numbering and has not been backfilled
              falls back to the id rather than showing nothing. */}
          <Card title="Account ID" description="Share this ID when you contact support.">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(accountRef);
                toast({ title: "Copied", description: "Account ID copied to clipboard." });
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <code className="truncate text-sm font-medium tracking-wide text-foreground">
                {accountRef}
              </code>
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </Card>
        </div>
      </div>
    </SettingsPage>
  );
});

const QuickAction = memo(function QuickAction({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
});

function safeParse(v: string) {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

export default PersonalInfoTab;
