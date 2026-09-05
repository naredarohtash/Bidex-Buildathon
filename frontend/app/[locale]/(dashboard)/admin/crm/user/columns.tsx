"use client";
import React from "react";
import { useTranslations } from "next-intl";
import {
  User,
  Mail,
  CalendarIcon,
  ToggleLeft,
  Shield,
  Clock,
  CheckSquare,
  Phone,
  BadgeIcon,
  Smartphone,
  MapPin,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { TIME_ZONES, zoneLabel } from "@/lib/time-zones";
import { useKycRules } from "@/app/[locale]/terminal/components/modals/account/kyc/use-kyc-rules";
import type { FormConfig } from "@/components/blocks/data-table/types/table";

export function useColumns() {
  const t = useTranslations("dashboard_admin");
  const tCommon = useTranslations("common");
  const tDashboard = useTranslations("dashboard");

  /* The countries verification is offered in, and the documents each of them
     accepts — the same `/api/kyc/documents` rules the trader's own KYC flow
     reads, cached at module scope by the hook. Offering the admin a free-text
     country and a free-text document type meant the two could disagree with
     each other and with what the flow would accept: an Aadhaar filed under
     Pakistan is a record no screen can make sense of. */
  const { countries } = useKycRules();

  return [
    {
      key: "user",
      disablePrefixSort: true,
      title: t("user_details"),
      expandedTitle: (row) => `User Profile: ${row.firstName || ''} ${row.lastName || ''}`,
      type: "compound",
      sortable: true,
      searchable: true,
      filterable: true,
      priority: 1,
      icon: User,
      render: {
        type: "compound",
        config: {
          image: {
            key: "avatar",
            fallback: "/img/placeholder.svg",
            type: "image",
            title: tCommon("avatar"),
            /* The portrait the trader sees on their own account, at the size
               of a portrait. It was the form's full width and 320px tall — a
               cover image for a field that holds one small round photo. */
            size: "xs",
            filterable: false,
            sortable: false,
          },
          primary: {
            key: ["firstName", "lastName"],
            title: [tCommon("first_name"), tCommon("last_name")],
            sortable: true,
            sortKey: "firstName",
            icon: User,
            validation: (value) => {
              if (!value) return "Name is required";
              if (value.length < 2)
                return "Name must be at least 2 characters long";
              return null;
            },
          },
          secondary: {
            key: "email",
            icon: Mail,
            type: "email",
            title: tCommon("email_address"),
            sortable: true,
            validation: (value) => {
              if (!value) return "Email is required";
              if (!/\S+@\S+\.\S+/.test(value)) return "Invalid email format";
              return null;
            },
          },
          metadata: [
            {
              key: "lastLogin",
              icon: Clock,
              type: "date",
              title: tCommon("last_login"),
              description: t("users_last_login_date"),
              sortable: true,
              render: (value) => value ? format(new Date(value), "MMM d, yyyy HH:mm") : "Never",
            },
            {
              key: "role",
              idKey: "id",
              labelKey: "name",
              baseKey: "roleId",
              icon: Shield,
              type: "select",
              title: tCommon("role"),
                      sortable: true,
              sortKey: "role.name",
              apiEndpoint: {
                url: "/api/admin/crm/role/options",
                method: "GET",
              },
              render: (value) => value?.name || "No Role",
            },
          ],
        },
      },
    },

    /* Basic info — form only; the table shows these inside the compound above.
    
       These win over the compound's own copy of them: `processFormConfigGroups`
       looks the key up in `columns` first and only falls back to unpacking the
       compound. So the size and the wording that matter are here.
    
       No descriptions. A field labelled "First Name" does not need "Users first
       name" underneath it, and six such lines were most of the height of this
       dialog. */
    {
      key: "avatar",
      title: tCommon("avatar"),
      type: "image",
      /* A portrait, at the size the trader sees their own: a small tile, not
         the full-width 320px drop zone this was. */
      size: "xs",
      icon: User,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "firstName",
      title: tCommon("first_name"),
      type: "text",
      icon: User,
      sortable: true,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "lastName",
      title: tCommon("last_name"),
      type: "text",
      icon: User,
      sortable: true,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "email",
      title: tCommon("email_address"),
      type: "email",
      icon: Mail,
      sortable: true,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "roleId",
      title: tCommon("role"),
      type: "select",
      icon: Shield,
      sortable: false,
      filterable: false,
      apiEndpoint: {
        url: "/api/admin/crm/role/options",
        method: "GET",
      },
      expandedOnly: true,
    },

    // Contact Information
    {
      key: "phone",
      title: tCommon("phone_number"),
      type: "text",
      icon: Phone,
      sortable: true,
      searchable: true,
      filterable: true,
      priority: 2,
      render: {
        type: "custom",
        render: (value: string) => {
          return value || "Not Provided";
        },
      },
    },
    {
      key: "phoneVerified",
      title: tCommon("phone_verified"),
      type: "boolean",
      icon: Smartphone,
      sortable: true,
      filterable: true,
      priority: 3,
      description: t("whether_the_users_phone_has_been_verified"),
    },

    // Account Status & Security
    {
      key: "status",
      title: tDashboard("account_status"),
      type: "select",
      icon: ToggleLeft,
      sortable: true,
      searchable: true,
      filterable: true,
      priority: 1,
      render: {
        type: "custom",
        render: (value: any, row: any) => {
          const isBlocked = row.blocks?.some((block: any) => block.isActive === true) || false;
          const variant = (() => {
            switch (value?.toUpperCase()) {
              case "ACTIVE":
                return "success";
              case "INACTIVE":
                return "muted";
              case "SUSPENDED":
                return "warning";
              case "BANNED":
                return "danger";
              default:
                return "default";
            }
          })();

          return (
            <div className="flex items-center space-x-2">
              <Badge
                variant={variant as any}
                className="capitalize"
              >
                {value?.toLowerCase()}
              </Badge>
              {isBlocked && (
                <Shield className="h-4 w-4 text-red-500" />
              )}
            </div>
          );
        },
      },
      options: [
        { value: "ACTIVE", label: tCommon("active") },
        { value: "INACTIVE", label: tCommon("inactive") },
        { value: "SUSPENDED", label: tCommon("suspended") },
        { value: "BANNED", label: tCommon("banned") },
      ],
    },
    {
      key: "emailVerified",
      title: tCommon("email_verified"),
      type: "boolean",
      icon: CheckSquare,
      sortable: true,
      filterable: true,
      priority: 2,
      /* The switch an admin throws to confirm an address by hand — after
         correcting a typo in it, say, where waiting for the user to find a
         second confirmation email helps nobody. The route writes the column
         directly, so no mail is sent either way. */
      description: "Confirms the address without sending an email",
    },

    // KYC Status - Simplified
    {
      key: "kyc.status",
      title: "Identity check",
      /* A select, so this is the admin's Verify control as well as the table's
         badge. Setting it to Verified approves the user's identity outright —
         the route creates the application if they never submitted one — which
         is the point: an admin who can see the person's documents should not
         have to walk them through a submission flow first. There is no "not
         submitted" option because Radix reserves the empty value for the
         cleared state; a user with no application shows the placeholder. */
      type: "select",
      icon: BadgeIcon,
      sortable: true,
      filterable: true,
      priority: 2,
      options: [
        { value: "APPROVED", label: "Verified" },
        { value: "PENDING", label: "In review" },
        { value: "ADDITIONAL_INFO_REQUIRED", label: "More info needed" },
        { value: "REJECTED", label: "Rejected" },
      ],
      render: {
        type: "custom",
        render: (value: string, row: any) => {
          if (!row.kyc) {
            return (
              <Badge variant="secondary" className="text-xs">
                {tCommon("not_submitted")}
              </Badge>
            );
          }

          const statusValue = value?.toUpperCase();
          let displayText = value || "Not Submitted";
          let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";

          switch (statusValue) {
            case "APPROVED":
              variant = "default";
              break;
            case "PENDING":
              variant = "outline";
              break;
            case "REJECTED":
              variant = "destructive";
              break;
            case "ADDITIONAL_INFO_REQUIRED":
              variant = "secondary";
              displayText = "Additional Info Required";
              break;
          }

          return (
            <Badge variant={variant} className="text-xs">
              {displayText}
            </Badge>
          );
        },
      },
    },

    // Two-Factor Authentication Status - Simplified
    {
      key: "twoFactor.enabled",
      title: `2FA ${tCommon('status')}`,
      type: "boolean",
      icon: Shield,
      sortable: false,
      filterable: false,
      priority: 3,
      description: t("two_factor_authentication_status"),
      render: {
        type: "custom",
        render: (value: boolean, row: any) => {
          const isEnabled = row.twoFactor?.enabled || false;
          return (
            <Badge variant={isEnabled ? "default" : "destructive"} className="text-xs">
              {isEnabled ? "Enabled" : "Disabled"}
            </Badge>
          );
        },
      },
    },

    // Timestamps
    {
      key: "createdAt",
      title: t("registration_date"),
      type: "date",
      icon: CalendarIcon,
      sortable: true,
      searchable: true,
      filterable: true,
      render: {
        type: "date",
        format: "PPP",
      },
      priority: 2,
    },

    /* Profile fields — form only.
     *
     * The same fields a trader fills in on their own Personal screen
     * (terminal/components/modals/account/personal-panel), under the same
     * names, because both write the same `profile` column.
     *
     * Three of them are lists rather than free text, and each list is the one
     * the trader was offered: the platform's 63 time zones, the countries KYC
     * runs in, and — following from the country — that country's own identity
     * documents. Typed by hand they drift, and a profile whose country says IN
     * and whose document says CNIC is one no screen can render.
     *
     * Descriptions are gone from almost all of them. A labelled dropdown of
     * countries does not need a sentence underneath explaining that it holds
     * a country, and eleven such sentences were most of the height of this
     * form.
     */
    {
      key: "profile.dob",
      title: "Date of birth",
      type: "date",
      icon: CalendarIcon,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.gender",
      title: "Gender",
      type: "select",
      icon: User,
      sortable: false,
      filterable: false,
      /* No "Not set" entry. Radix refuses a SelectItem with an empty value —
         it reserves "" for the cleared state that shows the placeholder — and
         rendering one throws hard enough to take the whole admin page down
         with it. Unset gender shows the placeholder, and "Prefer not to say"
         is the real answer for somebody who was asked and declined. */
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "other", label: "Other" },
        { value: "undisclosed", label: "Prefer not to say" },
      ],
      expandedOnly: true,
    },
    {
      key: "profile.nickname",
      title: "Nickname",
      type: "text",
      icon: User,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.timezone",
      title: "Time zone",
      type: "select",
      icon: Clock,
      sortable: false,
      filterable: false,
      options: TIME_ZONES.map((z) => ({ value: z.id, label: zoneLabel(z) })),
      expandedOnly: true,
    },
    {
      key: "profile.location.countryCode",
      title: tCommon("country"),
      type: "select",
      icon: MapPin,
      sortable: false,
      filterable: false,
      options: countries.map((c) => ({ value: c.code, label: c.name })),
      expandedOnly: true,
    },
    {
      key: "profile.location.state",
      title: "State or region",
      type: "text",
      icon: MapPin,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.location.city",
      title: tCommon("city"),
      type: "text",
      icon: MapPin,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.location.zip",
      title: "Postcode",
      type: "text",
      icon: MapPin,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.location.address",
      title: tCommon("address"),
      type: "text",
      icon: MapPin,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },
    {
      key: "profile.identityDocument.type",
      title: "Document",
      type: "select",
      icon: BadgeIcon,
      sortable: false,
      filterable: false,
      /* Follows the country above. `getOptions` is handed the live form values
         by FormControls, so choosing India narrows this to Aadhaar and PAN and
         choosing Pakistan to CNIC — the same choice the trader gets. With no
         country picked there is nothing honest to offer, and the placeholder
         says so. */
      getOptions: (values: any) => {
        const code = values?.profile?.location?.countryCode;
        const country = countries.find((c) => c.code === code);
        return (country?.documents || []).map((d) => ({
          value: d.id,
          label: d.label,
        }));
      },
      expandedOnly: true,
    },
    {
      key: "profile.identityDocument.number",
      title: "Document number",
      type: "text",
      icon: BadgeIcon,
      sortable: false,
      filterable: false,
      expandedOnly: true,
    },

    // Two-factor field (edit form only)
    {
      key: "disableTwoFactor",
      title: "Disable 2FA",
      type: "boolean",
      icon: Shield,
      sortable: false,
      filterable: false,
      description: "Check to disable two-factor authentication for this user",
      expandedOnly: true,
    },
  ];
}

/**
 * The admin's user form.
 *
 * ── What it holds ─────────────────────────────────────────────────────────
 *
 * Exactly what a trader is asked for on their own Personal screen
 * (terminal/components/modals/account/personal-panel), because both write the
 * same record. What it used to hold was a bio and six social-network URLs that
 * no screen in the product asks anybody for, and it could not show any of the
 * things they do give: date of birth, gender, nickname, time zone, identity
 * document, state.
 *
 * ── Nothing here is a gate ────────────────────────────────────────────────
 *
 * Only the name, the email and the role are required — the three things an
 * account cannot exist without. Everything else saves empty, in any
 * combination. That is the difference between this form and the trader's own:
 * their screens make them finish one thing before starting the next, because
 * the order is what makes verification mean anything. An admin is the person
 * those rules exist to escalate to. Marking an email confirmed, or an identity
 * verified, must not depend on a date of birth being filled in first — so it
 * does not, here or in the route.
 *
 * ── The three lists ───────────────────────────────────────────────────────
 *
 * Time zone, country and document are dropdowns fed by the same data the
 * trader is offered — the platform's zones, the countries KYC runs in, and
 * that country's documents. The document list follows the country, so IN
 * offers Aadhaar and PAN and PK offers CNIC. Typed by hand these drift apart,
 * and a profile whose country and document disagree is one no screen can
 * render.
 */
export function useFormConfig(): FormConfig {
  const t = useTranslations("dashboard_admin");
  const tCommon = useTranslations("common");

  const name = (label: string) => (value: string) => {
    if (!value) return `${label} is required`;
    if (!/^[\p{L} \-'.]+$/u.test(value))
      return `${label} can only contain letters, spaces, hyphens, apostrophes, and periods`;
    return null;
  };

  const email = (value: string) => {
    if (!value) return "Email is required";
    if (!/\S+@\S+\.\S+/.test(value)) return "Invalid email format";
    return null;
  };

  /* Titles and descriptions come from the columns — `mergeFieldWithColumn` in
     views/view-form carries type, required, validation, options and the
     endpoint across from here, and nothing else. */
  const account = {
    id: "account",
    title: "Account",
    icon: User,
    priority: 1,
    fields: [
      { key: "avatar", compoundKey: "user" },
      { key: "firstName", compoundKey: "user", required: true, validation: name("First name") },
      { key: "lastName", compoundKey: "user", required: true, validation: name("Last name") },
      { key: "email", compoundKey: "user", required: true, validation: email },
      { key: "emailVerified" },
      {
        key: "roleId",
        required: true,
        apiEndpoint: { url: "/api/admin/crm/role/options", method: "GET" },
      },
      {
        key: "status",
        required: true,
        options: [
          { value: "ACTIVE", label: tCommon("active") },
          { value: "INACTIVE", label: tCommon("inactive") },
          { value: "SUSPENDED", label: tCommon("suspended") },
          { value: "BANNED", label: tCommon("banned") },
        ],
      },
    ],
  };

  const personal = {
    id: "personal",
    title: "Personal",
    icon: Phone,
    priority: 2,
    fields: [
      { key: "profile.dob", required: false },
      { key: "profile.gender", required: false },
      /* No format rule. There was one — digits and a leading plus — and it
         refused every number an account holder had actually typed: "+91 98765
         43210" has spaces, and the account screens store the number exactly as
         given. */
      { key: "phone", required: false },
      { key: "profile.nickname", required: false },
      { key: "profile.timezone", required: false },
    ],
  };

  const location = {
    id: "location",
    title: tCommon("location"),
    icon: MapPin,
    priority: 3,
    fields: [
      { key: "profile.location.countryCode", required: false },
      { key: "profile.location.state", required: false },
      { key: "profile.location.city", required: false },
      { key: "profile.location.zip", required: false },
      { key: "profile.location.address", required: false },
    ],
  };

  /* The document is write-once for the account holder, and that is exactly why
     it is editable here: it is what an identity check is measured against, so
     only somebody outside the account may change it after the fact. */
  const identity = {
    id: "identity",
    title: "Identity",
    icon: BadgeIcon,
    priority: 4,
    fields: [
      { key: "profile.identityDocument.type", required: false },
      { key: "profile.identityDocument.number", required: false },
      { key: "kyc.status", required: false },
    ],
  };

  return {
    create: {
      title: t("create_new_user"),
      description: t("register_a_new_user_account_with"),
      groups: [account, personal, location, identity],
    },
    edit: {
      title: t("edit_user"),
      description: t("update_user_account_details_and_settings"),
      groups: [
        account,
        personal,
        location,
        {
          ...identity,
          fields: [
            ...identity.fields,
            /* Off only. Turning two-factor ON is the account holder's to do —
               it needs their authenticator, which an admin does not have. */
            { key: "disableTwoFactor", required: false },
          ],
        },
      ],
    },
  };
}
