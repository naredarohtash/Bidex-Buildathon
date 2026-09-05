"use strict";Object.defineProperty(exports,"__esModule",{value:!0});exports.metadata=void 0;const db_1=require("@b/db"),constants_1=require("@b/utils/constants"),query_1=require("@b/utils/query"),utils_1=require("./utils"),sequelize_1=require("sequelize");exports.metadata={summary:"Lists users with pagination and optional filtering",operationId:"listUsers",tags:["Admin","CRM","User"],parameters:constants_1.crudParameters,responses:{200:{description:"List of users with pagination information",content:{"application/json":{schema:{type:"object",properties:{data:{type:"array",items:{type:"object",properties:utils_1.userSchema}},pagination:constants_1.paginationSchema}}}}},401:query_1.unauthorizedResponse,404:(0,query_1.notFoundMetadataResponse)("Users"),500:query_1.serverErrorResponse},requiresAuth:!0,permission:"view.user",demoMask:["items.email","items.phone"]};exports.default=async e=>{const{query:t}=e;if("true"===t.all){return{data:await db_1.models.user.findAll({attributes:{exclude:["password","metadata"]},include:[{model:db_1.models.role,as:"role",attributes:["id","name"]}],where:{"$role.name$":{[sequelize_1.Op.ne]:"Super Admin"}}}),pagination:null}}const bidexResult=await(0,query_1.getFiltered)({model:db_1.models.user,query:t,sortField:t.sortField||"createdAt",includeModels:[{model:db_1.models.role,as:"role",required:!0,attributes:["id","name"]},{model:db_1.models.kycApplication,as:"kycApplications",required:!1,attributes:["id","status"]},{model:db_1.models.twoFactor,as:"twoFactor",required:!1,attributes:["id","enabled","type"]},{model:db_1.models.userBlock,as:"blocks",required:!1,attributes:["id","isActive"]}],excludeFields:["password","metadata"],excludeRecords:[{model:db_1.models.role,key:"name",value:"Super Admin"}]});

/* BIDEX_ADMIN_USER_KYC
 *
 * The effective KYC application, flattened onto each row as `kyc`.
 *
 * The list joins `kycApplications` and nothing turned that array into the
 * single answer the table asks for, so the "Identity check" column read
 * `row.kyc` — which was never there — and showed every user as "Not
 * submitted", verified ones included. It is also what the edit form reads to
 * show where a user's verification stands.
 *
 * "Effective" means the same thing as in utils/kyc's getEffectiveKycStatus:
 * an APPROVED application wins over anything else, because that is what makes
 * an account verified. Failing that, the most recent one is the state anybody
 * is waiting on.
 */
const bidexRows = Array.isArray(bidexResult && bidexResult.items) ? bidexResult.items : null;
if (bidexRows) {
  for (const row of bidexRows) {
    const apps = Array.isArray(row && row.kycApplications) ? row.kycApplications : [];
    const effective = apps.find((a) => a && a.status === "APPROVED") || apps[apps.length - 1] || null;
    row.kyc = effective ? { id: effective.id, status: effective.status } : null;
  }
}
return bidexResult};