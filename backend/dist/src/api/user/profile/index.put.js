"use strict";Object.defineProperty(exports,"__esModule",{value:!0});exports.updateUserQuery=exports.metadata=void 0;const error_1=require("@b/utils/error"),query_1=require("@b/utils/query"),db_1=require("@b/db"),promises_1=require("fs/promises"),console_1=require("@b/utils/console");exports.metadata={summary:"Updates the profile of the current user",description:"Updates the profile of the currently authenticated user",operationId:"updateProfile",tags:["Auth"],requiresAuth:!0,logModule:"USER",logTitle:"Update profile",requestBody:{required:!0,content:{"application/json":{schema:{type:"object",properties:{firstName:{type:"string",description:"First name of the user"},lastName:{type:"string",description:"Last name of the user"},metadata:{type:"object",description:"Metadata of the user"},avatar:{type:"string",description:"Avatar of the user",nullable:!0},phone:{type:"string",description:"Phone number of the user"},twoFactor:{type:"boolean",description:"Two-factor authentication status"},profile:{type:"object",nullable:!0,properties:{bio:{type:"string",description:"User bio",nullable:!0},location:{type:"object",nullable:!0,properties:{address:{type:"string",description:"User address",nullable:!0},city:{type:"string",description:"User city",nullable:!0},country:{type:"string",description:"User country",nullable:!0},zip:{type:"string",description:"User zip code",nullable:!0}}},social:{type:"object",nullable:!0,properties:{twitter:{type:"string",description:"Twitter profile",nullable:!0},dribbble:{type:"string",description:"Dribbble profile",nullable:!0},instagram:{type:"string",description:"Instagram profile",nullable:!0},github:{type:"string",description:"GitHub profile",nullable:!0},gitlab:{type:"string",description:"GitLab profile",nullable:!0},telegram:{type:"string",description:"Telegram username",nullable:!0}}}}},settings:{type:"object",description:"Notification settings for the user",properties:{email:{type:"boolean",description:"Email notifications enabled or disabled"},sms:{type:"boolean",description:"SMS notifications enabled or disabled"},push:{type:"boolean",description:"Push notifications enabled or disabled"}}}}}}}},responses:{200:{description:"User profile updated successfully",content:{"application/json":{schema:{type:"object",properties:{message:{type:"string",description:"Success message"}}}}}},401:query_1.unauthorizedResponse,404:(0,query_1.notFoundMetadataResponse)("User"),500:query_1.serverErrorResponse}};exports.default=async e=>{var t;const{user:r,body:s,ctx:i}=e;if(!r){null==i||i.fail("User not authenticated");throw(0,error_1.createError)({statusCode:401,message:"Authentication required to update profile"})}const{firstName:o,lastName:a,metadata:n,avatar:l,phone:p,twoFactor:u,profile:d,settings:c}=s;null==i||i.step("Updating user profile");const b=await(0,exports.updateUserQuery)(r.id,o,a,n,l,p,u,d,c,null!==(t=r.avatar)&&void 0!==t?t:void 0);null==i||i.success("Profile updated successfully");return b};/* BIDEX_LOCKED_PROFILE_FIELDS
 *
 * Date of birth and the identity document (Aadhaar / PAN) are write-once from
 * the account side: a user may set them, and after that only an admin may
 * change them. The UI disables the inputs once they hold a value, but that is
 * cosmetic — this route accepts a whole `profile` object, so anything trusting
 * the disabled attribute is one hand-made PUT away from being edited.
 *
 * So the check lives here. Whatever the caller sends, any locked field that is
 * ALREADY set is restored from the stored profile before the write. Fields that
 * are still empty pass through, which is what lets someone fill them in once.
 * Clearing is not a way round it either: an empty incoming value is overwritten
 * by the stored one just the same.
 *
 * The country of residence joins them. Which identity documents exist at all
 * depends on it — an Indian is offered Aadhaar and PAN, a Pakistani CNIC — so
 * letting somebody change their country after a document is on file leaves an
 * Aadhaar number filed under Pakistan, and after a review has passed it would
 * silently move a verified account to a jurisdiction nobody checked it against.
 * The rest of the address stays editable: people move house far more often
 * than they change nationality.
 *
 * Entries may be dotted paths, because the country lives at
 * `location.countryCode` rather than at the top level.
 */
const BIDEX_LOCKED_PROFILE_FIELDS = [
  "dob",
  "identityDocument",
  "location.countryCode",
  "location.country",
];

const bidexReadPath = (obj, path) =>
  path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), obj);

const bidexWritePath = (obj, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  let node = obj;
  for (const key of keys) {
    if (node[key] == null || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[last] = value;
};

const bidexDeletePath = (obj, path) => {
  const keys = path.split(".");
  const last = keys.pop();
  let node = obj;
  for (const key of keys) {
    if (node == null || typeof node[key] !== "object") return;
    node = node[key];
  }
  if (node) delete node[last];
};

/* BIDEX_UNLOCK_ON_REJECTION
 *
 * The two locks above are anti-fraud, not punishment, and they had one state
 * badly wrong: a rejected application is usually rejected *because* one of the
 * locked fields does not match the document — a date of birth typed a month
 * out, a country picked from the wrong list, a number transposed — and the
 * screen that says "here is what to change" was followed by a form that would
 * not let anybody change it. The only way out was support.
 *
 * So while the newest application is REJECTED or ADDITIONAL_INFO_REQUIRED, the
 * locked fields open again: that is the one state where the platform has
 * already told this person their details are wrong. Approved and pending
 * accounts stay shut, which is where a silent edit to identity data would
 * actually matter, and so does an account that has never applied — nothing has
 * been checked there to disagree with.
 */
const BIDEX_CORRECTABLE = ["REJECTED", "ADDITIONAL_INFO_REQUIRED"];

/* The newest application's status, or null where there is none. "UNKNOWN" is
   returned for a read that failed, so each caller can decide which way that
   falls — both of them fall towards locked. */
const bidexKycStatus = async (userId) => {
  try {
    const application = await db_1.models.kycApplication.findOne({
      where: { userId },
      order: [["createdAt", "DESC"]],
      attributes: ["status"],
      raw: true,
    });
    return application ? String(application.status || "") : null;
  } catch (err) {
    console_1.logger.error("USER", `KYC status check failed: ${err.message}`);
    return "UNKNOWN";
  }
};

const bidexNeedsCorrection = async (userId) => {
  /* Fail closed. An application we cannot read is not a licence to edit. */
  const status = await bidexKycStatus(userId);
  return !!status && BIDEX_CORRECTABLE.includes(status);
};

/* BIDEX_LOCK_WHEN_VERIFIED
 *
 * Everything above is write-once: a field may be set by the account holder and
 * then only by an admin. The name and the gender were neither — they are
 * ordinary profile fields, and while nobody has checked them that is right.
 *
 * Once an application is APPROVED they stop being ordinary. A person has read
 * those values off a document and approved the account against them, so an
 * account that can rewrite any of them afterwards is an account where the
 * approval means nothing: verify as one person, trade as another, and every
 * record downstream — the audit trail, the withdrawal that gets checked
 * against a name — now describes somebody who was never verified.
 *
 * So an approved account's identity fields shut, the name and the gender with
 * them, and support is the only way through. An unreadable application counts
 * as approved here, for the same reason it counts as not-correctable above.
 */
const bidexIsVerified = async (userId) => {
  const status = await bidexKycStatus(userId);
  return status === "APPROVED" || status === "UNKNOWN";
};

/* Locked for an approved account, on top of the write-once list. */
const BIDEX_VERIFIED_PROFILE_FIELDS = ["gender"];

const nameIsChangeable = async (userId) => !(await bidexIsVerified(userId));

const preserveLockedProfileFields = async (userId, incoming) => {
  try {
    const status = await bidexKycStatus(userId);
    if (status && BIDEX_CORRECTABLE.includes(status)) return incoming;
    const parse = (v) => (typeof v === "string" ? JSON.parse(v || "{}") : v || {});
    const next = parse(incoming);
    if (!next || typeof next !== "object") return incoming;

    const row = await db_1.models.user.findByPk(userId, { attributes: ["profile"] });
    const current = parse(row && row.profile);

    const verified = status === "APPROVED" || status === "UNKNOWN";
    const locked = verified
      ? BIDEX_LOCKED_PROFILE_FIELDS.concat(BIDEX_VERIFIED_PROFILE_FIELDS)
      : BIDEX_LOCKED_PROFILE_FIELDS;

    let changed = false;
    for (const key of locked) {
      const held = bidexReadPath(current, key);
      const isSet =
        held !== undefined && held !== null && held !== "" &&
        !(typeof held === "object" && Object.keys(held).length === 0);
      if (!isSet) continue;
      if (JSON.stringify(bidexReadPath(next, key)) !== JSON.stringify(held)) {
        console_1.logger.warn("USER", `Ignored attempt to change locked profile field '${key}' for user ${userId}`);
      }
      bidexWritePath(next, key, held);
      changed = true;
    }
    return changed ? next : incoming;
  } catch (err) {
    // A guard that throws would block ordinary profile saves. Failing closed on
    // the WRITE is not an option here, so fail closed on the FIELD: drop the
    // locked keys entirely rather than risk letting an edit through.
    console_1.logger.error("USER", `Locked-field check failed: ${err.message}`);
    try {
      const next = typeof incoming === "string" ? JSON.parse(incoming) : { ...(incoming || {}) };
      for (const key of BIDEX_LOCKED_PROFILE_FIELDS.concat(BIDEX_VERIFIED_PROFILE_FIELDS)) {
        bidexDeletePath(next, key);
      }
      return next;
    } catch {
      return incoming;
    }
  }
};

/* BIDEX_LOCKED_PHONE
 *
 * The phone number is write-once from the account side, the same rule as date
 * of birth and the identity document. It is a top-level column rather than a
 * key inside `profile`, so the profile guard above does not cover it and it
 * needs its own check.
 *
 * Once a number is stored, a later value is ignored — the stored one stands.
 * While it is empty anything may be written, which is what lets someone set it
 * once. Clearing it is not a way round the rule either: an empty incoming
 * value simply leaves the stored number in place.
 */
const phoneIsChangeable = async (userId, incoming) => {
  try {
    const row = await db_1.models.user.findByPk(userId, { attributes: ["phone"] });
    const held = row && row.phone;
    if (held === undefined || held === null || held === "") return true; // not set yet
    /* And again while a rejected application is waiting to be corrected — a
       number that reached the wrong phone is exactly the kind of thing a
       reviewer sends back. See BIDEX_UNLOCK_ON_REJECTION. */
    if (await bidexNeedsCorrection(userId)) return true;
    if (String(held) !== String(incoming ?? "")) {
      console_1.logger.warn("USER", `Ignored attempt to change locked phone for user ${userId}`);
    }
    return false;
  } catch (err) {
    // Fail closed on the field rather than on the whole save.
    console_1.logger.error("USER", `Phone lock check failed: ${err.message}`);
    return false;
  }
};

const updateUserQuery=async(e,t,r,s,i,o,a,n,l,p)=>{const u={};
/* The name, once a check has passed: the stored one stands. See
   BIDEX_LOCK_WHEN_VERIFIED. */
const bidexNameOpen=await nameIsChangeable(e);
if(void 0!==t){if(bidexNameOpen)u.firstName=t;else console_1.logger.warn("USER",`Ignored attempt to change locked name for user ${e}`)}
if(void 0!==r&&bidexNameOpen)u.lastName=r;
void 0!==s&&(u.metadata=s);void 0!==i&&(u.avatar=i);if(void 0!==o&&await phoneIsChangeable(e,o)){u.phone=o}void 0!==a&&(u.twoFactor=a);if(void 0!==n){u.profile=await preserveLockedProfileFields(e,n)}if(void 0!==l){const t="string"==typeof l?JSON.parse(l):l,r=await db_1.models.user.findByPk(e,{attributes:["settings"]}),s=(null==r?void 0:r.settings)||{};u.settings={...s,...t}}if(null===i&&p)try{await(0,promises_1.unlink)(p)}catch(e){console_1.logger.error("USER","Failed to unlink avatar",e);throw(0,error_1.createError)({statusCode:500,message:"Failed to unlink avatar from server"})}await db_1.models.user.update(u,{where:{id:e}});return{message:"Profile updated successfully"}};exports.updateUserQuery=updateUserQuery;