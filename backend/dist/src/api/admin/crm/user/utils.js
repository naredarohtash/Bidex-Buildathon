"use strict";async function getUserCountsPerDay(e){var t,a,s;null===(t=null==e?void 0:e.step)||void 0===t||t.call(e,"Fetching user counts for the last 30 days");const r=new Date;r.setDate(r.getDate()-30);const i=await db_1.models.user.findAll({where:{createdAt:{[sequelize_1.Op.gte]:r}},attributes:["createdAt","status","emailVerified"]});null===(a=null==e?void 0:e.step)||void 0===a||a.call(e,"Processing user count statistics");const o={registrations:{},activeUsers:{},bannedUsers:{},verifiedEmails:{}};i.forEach(e=>{if(!e.createdAt)return;const t=e.createdAt.toISOString().split("T")[0];o.registrations[t]=(o.registrations[t]||0)+1;"ACTIVE"===e.status&&(o.activeUsers[t]=(o.activeUsers[t]||0)+1);"BANNED"===e.status&&(o.bannedUsers[t]=(o.bannedUsers[t]||0)+1);e.emailVerified&&(o.verifiedEmails[t]=(o.verifiedEmails[t]||0)+1)});null===(s=null==e?void 0:e.success)||void 0===s||s.call(e,"User counts calculated successfully");return{registrations:(0,utils_1.convertAndSortCounts)(o.registrations),activeUsers:(0,utils_1.convertAndSortCounts)(o.activeUsers),bannedUsers:(0,utils_1.convertAndSortCounts)(o.bannedUsers),verifiedEmails:(0,utils_1.convertAndSortCounts)(o.verifiedEmails)}}Object.defineProperty(exports,"__esModule",{value:!0});exports.userStoreSchema=exports.userUpdateSchema=exports.userSchema=void 0;exports.getUserCountsPerDay=getUserCountsPerDay;const utils_1=require("@b/utils"),db_1=require("@b/db"),sequelize_1=require("sequelize"),schema_1=require("@b/utils/schema"),id=(0,schema_1.baseStringSchema)("ID of the user"),email=(0,schema_1.baseStringSchema)("Email of the user",100,0,!1,"^[^@]+@[^@]+\\.[^@]+$","example@site.com"),avatar=(0,schema_1.baseStringSchema)("Avatar of the user",255,0,!0),firstName=(0,schema_1.baseStringSchema)("First name of the user",50),lastName=(0,schema_1.baseStringSchema)("Last name of the user",50),emailVerified=(0,schema_1.baseBooleanSchema)("Email verification status"),phone=(0,schema_1.baseStringSchema)("User's phone number",10,10,!0,"^[0-9]{10}$","1234567890"),status=(0,schema_1.baseEnumSchema)("Status of the user",["ACTIVE","INACTIVE","BANNED","SUSPENDED"]),roleId=(0,schema_1.baseStringSchema)("Role ID associated with the user"),twoFactor=(0,schema_1.baseBooleanSchema)("Whether two-factor authentication is enabled"),profile={type:"object",nullable:!0,properties:{bio:(0,schema_1.baseStringSchema)("Bio",500),location:{type:"object",properties:{address:(0,schema_1.baseStringSchema)("Detailed address of the user"),city:(0,schema_1.baseStringSchema)("City"),country:(0,schema_1.baseStringSchema)("Country"),zip:(0,schema_1.baseStringSchema)("Zip code",10,5,!1)}},social:{type:"object",properties:{facebook:(0,schema_1.baseStringSchema)("Facebook URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://facebook.com/yourusername"),twitter:(0,schema_1.baseStringSchema)("Twitter URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://twitter.com/yourusername"),dribbble:(0,schema_1.baseStringSchema)("Dribbble URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://dribbble.com/yourusername"),instagram:(0,schema_1.baseStringSchema)("Instagram URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://instagram.com/yourusername"),github:(0,schema_1.baseStringSchema)("Github URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://github.com/yourusername"),gitlab:(0,schema_1.baseStringSchema)("Gitlab URL",255,0,!0,"^https?:\\/\\/[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]+$","http://gitlab.com/yourusername")}}}},lastLogin=(0,schema_1.baseDateTimeSchema)("Last login date"),lastFailedLogin=(0,schema_1.baseDateTimeSchema)("Last failed login date"),failedLoginAttempts=(0,schema_1.baseIntegerSchema)("Number of failed login attempts"),walletAddress=(0,schema_1.baseStringSchema)("Wallet address of the user"),walletProvider=(0,schema_1.baseStringSchema)("Wallet provider of the user");exports.userSchema={id:id,email:email,avatar:avatar,firstName:firstName,lastName:lastName,emailVerified:emailVerified,phone:phone,status:status,roleId:roleId,twoFactor:twoFactor,profile:profile,lastLogin:lastLogin,lastFailedLogin:lastFailedLogin,failedLoginAttempts:failedLoginAttempts,walletAddress:walletAddress,walletProvider:walletProvider};exports.userUpdateSchema={type:"object",properties:{avatar:avatar,firstName:firstName,lastName:lastName,email:email,phone:phone,status:status,emailVerified:emailVerified,twoFactor:twoFactor,profile:profile,roleId:roleId},required:["email","firstName","lastName","roleId"]};exports.userStoreSchema={description:"User created or updated successfully",content:{"application/json":{schema:{type:"object",properties:exports.userSchema}}}};

/* BIDEX_ADMIN_USER_SCHEMA
 *
 * What was here rejected every save the admin form could make.
 *
 * The generated schema validated optional fields as if they were required:
 * `phone` carried minLength 10 and `^[0-9]{10}$`, `zip` minLength 5, and each
 * of the six social URLs a full http(s) pattern. The form posts "" for
 * anything left blank, and "" fails a minimum and fails a pattern, so opening
 * a user and pressing Save — changing nothing — came back with nine errors at
 * once: "Phone must be at least 10 characters long; Zip must be at least 5
 * characters long; Facebook is incorrectly formatted…". There was no way to
 * save a user who had not filled in a Dribbble URL.
 *
 * `nullable: true` was on most of those fields and did nothing: this is plain
 * AJV (see utils/ajv), not an OpenAPI validator, and `nullable` is not a JSON
 * Schema keyword — it is logged and ignored under `strict: "log"`. So the
 * optional strings here are typed `["string", "null"]`, which is the JSON
 * Schema way to say the same thing, and they carry no minimum and no pattern.
 * An admin correcting a record is not the place to enforce a format the user's
 * own screens already enforce; refusing the whole save because of a field the
 * admin never touched is worse than storing a short phone number.
 *
 * `profile` now names what the account screens actually store — date of birth,
 * gender, nickname, time zone, the identity document, and a location that
 * includes `state` and `countryCode`. The old shape knew only bio, four
 * address lines and six social networks, none of which any user screen asks
 * for. See ../../../../api/admin/crm/user/[id]/index.put.js for why sending a
 * partial profile used to erase the rest of it.
 *
 * Only `userUpdateSchema` is replaced. `userSchema` documents the GET
 * responses and is left alone.
 */

/** An optional string: absent, empty and null are all fine. */
const bidexOptionalString = (description) => ({
  type: ["string", "null"],
  description,
});

exports.userUpdateSchema = {
  type: "object",
  properties: {
    avatar: bidexOptionalString("Avatar of the user"),
    firstName: {
      type: "string",
      description: "First name of the user",
      minLength: 1,
      maxLength: 50,
    },
    lastName: {
      type: "string",
      description: "Last name of the user",
      minLength: 1,
      maxLength: 50,
    },
    email: {
      type: "string",
      description: "Email of the user",
      maxLength: 100,
      pattern: "^[^@]+@[^@]+\\.[^@]+$",
    },
    /* Free-form on purpose. The number is stored as the account holder typed
       it, dialling code and all, and an admin correcting a typo should not
       have to satisfy a ten-digit Indian format. */
    phone: bidexOptionalString("Phone number, as the account holder gave it"),
    status: {
      type: "string",
      description: "Status of the user",
      enum: ["ACTIVE", "INACTIVE", "BANNED", "SUSPENDED"],
    },
    emailVerified: {
      type: "boolean",
      description: "Whether the email address is verified",
    },
    /* Two names for one switch. The admin form's field is `disableTwoFactor`,
       which never reached the handler because it destructured `twoFactor`, so
       the toggle silently did nothing. Both are accepted now, and the handler
       acts only on a literal `true`.

       `twoFactor` also arrives as an object rather than a boolean: the table's
       `twoFactor.enabled` column makes the form hold `{ enabled: false }`
       under that key, and the whole form object is posted. Declaring it
       boolean-only would fail every save on a field nobody edited — the same
       class of bug as the phone pattern above. */
    twoFactor: {
      type: ["boolean", "object", "null"],
      description: "true to disable two-factor. An object here is ignored.",
    },
    disableTwoFactor: {
      type: "boolean",
      description: "Set to disable two-factor authentication",
    },
    roleId: { type: ["string", "number"], description: "Role ID of the user" },
    /* The identity check, as the admin's one control over it. Setting it to
       APPROVED marks the account verified outright — the route creates the
       application if the user never submitted one — because an admin who has
       seen somebody's documents should not have to walk them through a
       submission flow first. */
    kyc: {
      type: ["object", "null"],
      properties: {
        status: {
          type: ["string", "null"],
          enum: [
            "PENDING",
            "APPROVED",
            "REJECTED",
            "ADDITIONAL_INFO_REQUIRED",
            "",
            null,
          ],
          description: "Status to put the user's identity check into",
        },
      },
      additionalProperties: true,
    },
    profile: {
      type: ["object", "null"],
      description: "The same profile object the account screens write",
      properties: {
        bio: bidexOptionalString("Bio"),
        nickname: bidexOptionalString("Display name on the leaderboard"),
        gender: bidexOptionalString("male | female | other | undisclosed"),
        dob: bidexOptionalString("Date of birth, stored as YYYY-MM-DD"),
        timezone: bidexOptionalString("IANA time zone id"),
        identityDocument: {
          type: ["object", "null"],
          description: "The document identity was checked against",
          properties: {
            type: bidexOptionalString("Document type, e.g. aadhaar, cnic"),
            number: bidexOptionalString("Document number"),
          },
          additionalProperties: true,
        },
        location: {
          type: ["object", "null"],
          properties: {
            address: bidexOptionalString("Street address"),
            city: bidexOptionalString("City"),
            state: bidexOptionalString("State or region"),
            country: bidexOptionalString("Country, as an ISO 3166-1 alpha-2 code"),
            countryCode: bidexOptionalString("ISO 3166-1 alpha-2 country code"),
            zip: bidexOptionalString("Postcode"),
          },
          additionalProperties: true,
        },
      },
      /* Anything an account screen adds later still validates rather than
         being rejected by a schema nobody remembered to widen. */
      additionalProperties: true,
    },
  },
  required: ["email", "firstName", "lastName", "roleId"],
};

/* BIDEX_ADMIN_USER_PROFILE
 *
 * Two things every admin write of `profile` has to do.
 *
 * **Merge, never replace.** The admin form posts only the fields it shows, and
 * the handler wrote that object straight over the column. A user who had set a
 * date of birth, a nickname, a time zone and an identity document lost all
 * four the first time an admin corrected their city — silently, because the
 * response is "User updated successfully" either way. Absent means "leave it";
 * an explicit "" or null means "clear it", which is the only reading that lets
 * an admin both edit one field and empty another.
 *
 * **Normalise what the account screens will read back.** Two values have a
 * shape the user's own components depend on:
 *
 * - `dob` is stored as YYYY-MM-DD and the date-of-birth picker parses it with
 *   `split("-").map(Number)`. The admin form's date control emits a full ISO
 *   timestamp, which that split turns into NaN — the picker would come up
 *   blank on a date that is really there.
 * - the country is held twice, at `location.countryCode` and `location.country`,
 *   because older profiles put the ISO code in `country`. The account screens
 *   read `countryCode` first and fall back. Writing one and not the other
 *   leaves a profile that disagrees with itself, so each fills in the other.
 */
const bidexParseProfile = (value) => {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value || "{}") || {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
};

/** Date-only, when it is a date at all. Anything unparseable is left as given. */
const bidexDateOnly = (value) => {
  if (!value || typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
};

const bidexNormalizeProfile = (profile) => {
  const next = bidexParseProfile(profile);
  if (next.dob) next.dob = bidexDateOnly(next.dob);

  const loc = next.location;
  if (loc && typeof loc === "object") {
    const code = loc.countryCode || loc.country || "";
    if (code) {
      loc.countryCode = code;
      loc.country = code;
    }
  }
  return next;
};

/**
 * The stored profile with the incoming one laid over it.
 *
 * One level deep for `location` and `identityDocument` — the two objects the
 * form sends a part of — and a plain overwrite for everything else, because
 * nothing else in a profile is a nested record.
 */
const bidexMergeProfile = (stored, incoming) => {
  const base = bidexParseProfile(stored);
  const patch = bidexNormalizeProfile(incoming);
  const merged = { ...base, ...patch };

  for (const key of ["location", "identityDocument"]) {
    const from = base[key];
    const to = patch[key];
    if (from && typeof from === "object" && to && typeof to === "object") {
      merged[key] = { ...from, ...to };
    }
  }
  return merged;
};

exports.bidexParseProfile = bidexParseProfile;
exports.bidexNormalizeProfile = bidexNormalizeProfile;
exports.bidexMergeProfile = bidexMergeProfile;
