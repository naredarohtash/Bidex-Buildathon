"use strict";
Object.defineProperty(exports, "__esModule", { value: !0 });
exports.metadata = void 0;
const error_1 = require("@b/utils/error"),
  db_1 = require("@b/db"),
  query_1 = require("@b/utils/query"),
  utils_1 = require("../utils"),
  /* The one level every application hangs off, created on demand — the same
     helper the trader's own submission uses, so an application an admin makes
     here is indistinguishable from one they submitted themselves. */
  kycUtils_1 = require("../../../../user/kyc/verification/utils");

/* BIDEX_ADMIN_USER_UPDATE
 *
 * Rewritten from the minified original in readable form — same route, same
 * permission, same authorisation checks — because two of its lines were
 * losing data and a third was dead.
 *
 * **`profile` was written, not merged.** The admin form posts only the fields
 * it renders, so `profile: body.profile` replaced the whole column: a user's
 * date of birth, gender, nickname, time zone and identity document were
 * erased the first time an admin corrected their city. It goes through
 * `bidexMergeProfile` now (see ../utils) — absent keys keep what is stored, an
 * explicit "" clears.
 *
 * **The 2FA switch did nothing.** The form's field is `disableTwoFactor`; this
 * handler destructured `twoFactor`. The toggle posted, the route ignored it,
 * and the response still said "User updated successfully". Either name works
 * now.
 *
 * **Undefined no longer means "write undefined".** Only the keys the request
 * actually carried are put in the update, so a caller sending a subset — the
 * form, an import, a script — cannot blank a column it never mentioned.
 * Sequelize skips `undefined` today, but the guarantee should be in the route
 * rather than in a library's behaviour.
 *
 * Not changed: the request schema, which lives in ../utils next to the create
 * route that shares it, and the rule that only a Super Admin may move
 * somebody's role.
 */

exports.metadata = {
  summary: "Updates a specific user by UUID",
  operationId: "updateUserByUuid",
  tags: ["Admin", "CRM", "User"],
  logModule: "ADMIN_CRM",
  logTitle: "Update user",
  parameters: [
    {
      index: 0,
      name: "id",
      in: "path",
      required: !0,
      description: "ID of the user to update",
      schema: { type: "string" },
    },
  ],
  requestBody: {
    required: !0,
    content: { "application/json": { schema: utils_1.userUpdateSchema } },
  },
  responses: (0, query_1.updateRecordResponses)("User"),
  requiresAuth: !0,
  permission: "edit.user",
};

exports.default = async (data) => {
  const { params, body, user, ctx } = data;
  const { id } = params;
  const {
    firstName,
    lastName,
    email,
    roleId,
    avatar,
    phone,
    emailVerified,
    twoFactor,
    disableTwoFactor,
    status,
    profile,
    kyc,
  } = body;

  ctx?.step("Validating user authorization");
  if (!user?.id)
    throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });

  const actor = await db_1.models.user.findOne({
    where: { id: user.id },
    include: [{ model: db_1.models.role, as: "role" }],
  });
  if (!actor)
    throw (0, error_1.createError)({
      statusCode: 401,
      message: "Unauthorized - User not found",
    });

  ctx?.step("Fetching target user");
  const target = await db_1.models.user.findOne({
    where: { id },
    include: [{ model: db_1.models.role, as: "role" }],
  });
  if (!target)
    throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });

  const isSuperAdmin = actor.role?.name === "Super Admin";
  if (target.id === actor.id && !isSuperAdmin)
    throw (0, error_1.createError)({
      statusCode: 400,
      message: "You cannot update your own account",
    });

  ctx?.step("Updating user details");

  /* BIDEX_EMPTY_MEANS_NULL
   *
   * A cleared field is null, not "".
   *
   * `phone` and `avatar` carry model-level format checks — `^[+0-9]+$` and a
   * URL pattern — and an empty string satisfies neither, so writing "" came
   * back as "Validation error: phone: Phone number must contain only digits
   * and can start with a plus sign". The form posts "" for every field left
   * blank, which meant no user without a phone number could be saved at all,
   * whatever else the admin had changed. `allowNull: true` on both columns
   * makes null skip the check, and null is the honest value for "there isn't
   * one" — the same thing the column holds for a user who never gave it. */
  const blankToNull = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

  const changes = {};
  if (firstName !== undefined) changes.firstName = firstName;
  if (lastName !== undefined) changes.lastName = lastName;
  if (email !== undefined) changes.email = email;
  if (avatar !== undefined) changes.avatar = blankToNull(avatar);
  if (phone !== undefined) changes.phone = blankToNull(phone);
  if (emailVerified !== undefined) changes.emailVerified = emailVerified;
  if (status !== undefined) changes.status = status;
  /* Role moves are a Super Admin's call, as before. */
  if (roleId !== undefined && isSuperAdmin) changes.roleId = roleId;
  if (profile !== undefined) {
    changes.profile = (0, utils_1.bidexMergeProfile)(target.profile, profile);
  }

  await db_1.models.user.update(changes, { where: { id } });

  /* One switch, two names — see the note at the top. Compared against a
     literal `true` rather than tested for truthiness, because `twoFactor`
     usually arrives as `{ enabled: false }`: the table has a
     `twoFactor.enabled` column, the form holds an object under that key, and
     the whole form object is posted. A truthiness test there would switch off
     two-factor on every save of every user who has it on. */
  if (disableTwoFactor === true || twoFactor === true) {
    ctx?.step("Disabling two-factor authentication");
    await db_1.models.twoFactor.update({ enabled: !1 }, { where: { userId: id } });
  }

  /* BIDEX_ADMIN_KYC_STATUS
   *
   * The identity check, set by hand.
   *
   * An account counts as verified when it holds an APPROVED kycApplication
   * whose level is above zero — see utils/kyc's getEffectiveKycStatus, which
   * is what `user.kycLevel` on the profile payload is derived from. There is
   * no column to flip; the application is the record.
   *
   * So this creates one when the user has never submitted anything. That is
   * the whole point of the control: an admin holding somebody's documents
   * should be able to mark them verified without first walking them through a
   * submission flow, and without a date of birth or an address being filled in
   * for it to work. What it writes into `data` is whatever the profile already
   * knows — country and document, when they are there — so the trader's own
   * KYC screen shows something truthful rather than an empty record.
   *
   * Nothing is deleted on the way down. Setting it back to PENDING leaves the
   * application and its history in place, and the account simply stops being
   * verified, which is the reversible half of an irreversible-looking switch.
   */
  const nextKycStatus = kyc && typeof kyc === "object" ? kyc.status : undefined;
  if (nextKycStatus) {
    ctx?.step(`Setting identity check to ${nextKycStatus}`);

    const existing = await db_1.models.kycApplication.findOne({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
    });

    if (existing) {
      existing.status = nextKycStatus;
      existing.reviewedAt = new Date();
      await existing.save();
    } else {
      const level = await (0, kycUtils_1.ensureVerificationLevel)();
      const stored = (0, utils_1.bidexParseProfile)(
        changes.profile !== undefined ? changes.profile : target.profile
      );
      const doc = stored.identityDocument || {};
      await db_1.models.kycApplication.create({
        userId: id,
        levelId: level.id,
        status: nextKycStatus,
        reviewedAt: new Date(),
        adminNotes: "Set by an administrator.",
        data: {
          countryCode: stored.location?.countryCode || stored.location?.country || "",
          documentLabel: doc.type || "",
          documentNumber: doc.number || "",
          submittedAt: new Date().toISOString(),
        },
      });
    }
  }

  ctx?.success();
  return { message: "User updated successfully" };
};
