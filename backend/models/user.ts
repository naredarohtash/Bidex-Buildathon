import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";
import { createUserCacheHooks } from "./init";

/**
 * Welcome email, sent once, when the account row is created.
 *
 * It lives on the model rather than in the registration route because that
 * route is compiled framework core with no source to edit, and because a user
 * can be created down more than one path — email signup, Google, an admin
 * creating an account. All of them end here.
 *
 * Three rules it has to obey:
 *
 *  - Never break the thing that created the user. A queue that is down, an SMTP
 *    box that is misconfigured or a missing template must not turn a successful
 *    registration into a 500, so every failure is swallowed and logged.
 *  - Never fire twice. `afterCreate` runs on creation only; an update that
 *    verifies the email later does not reach it.
 *  - Never fire for a seeded or imported row. Those arrive already verified,
 *    and mailing a batch of them is how a fresh database sends a thousand
 *    emails to real addresses.
 *
 * `require` rather than `import`, deliberately: the email utilities pull in the
 * database, which pulls in this file, and a static import closes that circle at
 * load time. Resolving it when the hook runs does not.
 */
async function sendWelcomeEmail(instance: any) {
  try {
    if (!instance?.email || instance.emailVerified) return;
    if (process.env.NODE_ENV === "test") return;

    const { emailQueue } = require("@b/utils/emails");
    await emailQueue.add({
      emailData: {
        TO: instance.email,
        FIRSTNAME: instance.firstName || "there",
        EMAIL: instance.email,
        CREATED_AT: instance.createdAt || new Date(),
      },
      emailType: "NewUserWelcome",
    });
  } catch (error: any) {
    /* Logged, not thrown. The account exists either way, and the verification
       email is the one that actually gates anything. */
    try {
      const { logger } = require("@b/utils/console");
      logger.error("EMAIL", "Welcome email could not be queued", error);
    } catch {
      /* logging is best-effort too */
    }
  }
}

/**
 * The number a person actually quotes.
 *
 * `id` is a UUID and always will be: it is the primary key, and every table
 * that references a user — wallets, transactions, KYC applications, sign-in
 * activity — carries it as a foreign key. Renaming it would not be a rename,
 * it would be a rewrite of every one of those rows with orphaned records as
 * the failure mode.
 *
 * So the UUID stays as the internal key and this is what gets shown. Eight
 * digits, no leading zero, which is 90 million possibilities — far more than
 * this platform will ever need and short enough to read down a phone line.
 *
 * Uniqueness is enforced by the column, not by hope: the hook retries on a
 * clash, and if it somehow cannot find a free number it leaves the field null
 * rather than failing the registration. A missing account number is a cosmetic
 * problem; a failed signup is not.
 */
export function generateAccountNumber(): string {
  return String(10000000 + Math.floor(Math.random() * 90000000));
}

async function assignAccountNumber(instance: any) {
  if (instance.accountId) return;
  try {
    const model = instance.constructor;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateAccountNumber();
      const taken = await model.findOne({
        where: { accountId: candidate },
        attributes: ["id"],
        paranoid: false,
      });
      if (!taken) {
        instance.accountId = candidate;
        return;
      }
    }
  } catch {
    /* Left unset. A backfill can give it one later; the account works without
       it, and a signup that fails because of a display field would not. */
  }
}

export default class user
  extends Model<userAttributes, userCreationAttributes>
  implements userAttributes
{
  id!: string;
  /** Eight digits, shown wherever a person needs to quote their account. */
  accountId?: string | null;
  email?: string;
  password?: string;
  avatar?: string | null;
  firstName?: string;
  lastName?: string;
  emailVerified!: boolean;
  phone?: string;
  phoneVerified!: boolean;
  roleId!: number;
  profile?: string;
  lastLogin?: Date;
  lastFailedLogin?: Date | null;
  failedLoginAttempts?: number;
  walletAddress?: string;
  walletProvider?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BANNED";
  settings?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    pushTokens?: any;
    webPushSubscriptions?: any[];
    /**
     * Account-level terminal preferences, mirrored from the browser so the
     * workspace follows the user between devices: pinned asset tabs, trading
     * settings, chart view options, active indicators and so on. A flat map of
     * storage key -> serialized value, written by /api/user/preferences.
     */
    terminal?: Record<string, string>;
  } | null;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;

  public static initModel(sequelize: Sequelize.Sequelize): typeof user {
    return user.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        accountId: {
          type: DataTypes.STRING(8),
          allowNull: true,
          unique: "accountId",
          comment: "Short, human-quotable account number. The UUID stays internal.",
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: true,
          unique: "email",
          validate: {
            isEmail: { msg: "email: Must be a valid email address" },
          },
          comment: "User's email address (unique identifier)",
        },
        password: {
          type: DataTypes.STRING(255),
          allowNull: true,
          validate: {
            len: {
              args: [8, 255],
              msg: "password: Password must be between 8 and 255 characters long",
            },
          },
          comment: "Hashed password for authentication",
        },
        avatar: {
          type: DataTypes.STRING(1000),
          allowNull: true,
          validate: {
            is: {
              args: ["^/(uploads|img)/.*$", "i"],
              msg: "avatar: Must be a valid URL",
            },
          },
          comment: "URL path to user's profile picture",
        },
        firstName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          validate: {
            is: {
              args: [/^[\p{L} \-'.]+$/u],
              msg: "firstName: First name can only contain letters, spaces, hyphens, apostrophes, and periods",
            },
          },
          comment: "User's first name",
        },
        lastName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          validate: {
            is: {
              args: [/^[\p{L} \-'.]+$/u],
              msg: "lastName: Last name can only contain letters, spaces, hyphens, apostrophes, and periods",
            },
          },
          comment: "User's last name",
        },

        emailVerified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          
          comment: "Whether the user's email address has been verified",
        },
        phone: {
          type: DataTypes.STRING(255),
          allowNull: true,
          /* BIDEX_PHONE_NORMALISE
           *
           * The column only ever holds `+` and digits — that is what the check
           * below enforces, and E.164 is what a reviewer and every SMS gateway
           * expect. What it used to do was *reject* anything else, which meant
           * a number typed the way people write numbers ("+91 98765 43210",
           * "(555) 123-4567") came back as "Phone number must contain only
           * digits and can start with a plus sign" and the whole save failed.
           * Both places that ask for a phone hand it over spaced: the KYC
           * details form composes "+91 9876543210", and the profile form's
           * placeholder literally shows spaces. So the identity check could
           * not be completed at all by anybody who typed their number
           * normally.
           *
           * A format the server is willing to store is the server's job to
           * produce. Punctuation is stripped here, before validation runs, and
           * a `+` is kept only where it belongs — at the front. What is left
           * is either a storable number or nothing, and nothing is null: an
           * empty string satisfies neither the check nor any reading of "there
           * isn't one". */
          set(this: any, value: unknown) {
            if (value === null || value === undefined) {
              this.setDataValue("phone", null);
              return;
            }
            const raw = String(value).trim();
            const plus = raw.startsWith("+");
            const digits = raw.replace(/\D/g, "");
            this.setDataValue("phone", digits ? (plus ? `+${digits}` : digits) : null);
          },
          validate: {
            is: {
              args: ["^[+0-9]+$", "i"],
              msg: "phone: Phone number must contain only digits and can start with a plus sign",
            },
          },
          comment: "User's phone number with country code",
        },
        phoneVerified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: "Whether the user's phone number has been verified",
        },
        roleId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "ID of the role assigned to this user",
        },
        profile: {
          type: DataTypes.JSON,
          allowNull: true,
          get() {
            const rawData = this.getDataValue("profile");
            // Parse the JSON string back into an object
            return rawData
              ? typeof rawData === "string"
                ? JSON.parse(rawData)
                : rawData
              : null;
          },
          set(value) {
            // Convert the JavaScript object into a JSON string before saving
            this.setDataValue("profile", JSON.stringify(value));
          },
          comment: "Additional user profile information in JSON format",
        },
        lastLogin: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Timestamp of the user's last successful login",
        },
        lastFailedLogin: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Timestamp of the user's last failed login attempt",
        },
        failedLoginAttempts: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 0,
          comment: "Number of consecutive failed login attempts",
        },
        status: {
          type: DataTypes.ENUM("ACTIVE", "INACTIVE", "SUSPENDED", "BANNED"),
          allowNull: true,
          defaultValue: "ACTIVE",
          comment: "Current status of the user account",
        },
        settings: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: {
            email: true,
            sms: true,
            push: true,
          },
          get() {
            const rawData = this.getDataValue("settings");
            // Parse the JSON string back into an object
            return rawData
              ? typeof rawData === "string"
                ? JSON.parse(rawData)
                : rawData
              : null;
          },
          comment: "User notification and preference settings",
        },
      },
      {
        sequelize,
        modelName: "user",
        tableName: "user",
        timestamps: true,
        paranoid: true,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "id" }],
          },
          {
            name: "id",
            unique: true,
            using: "BTREE",
            fields: [{ name: "id" }],
          },
          {
            name: "accountId",
            unique: true,
            using: "BTREE",
            fields: [{ name: "accountId" }],
          },
          {
            name: "email",
            unique: true,
            using: "BTREE",
            fields: [{ name: "email" }],
          },
          {
            name: "UserRoleIdFkey",
            using: "BTREE",
            fields: [{ name: "roleId" }],
          },
        ],
        hooks: {
          ...createUserCacheHooks((instance) => instance.id),
          /* Before the insert, so the number is written with the row rather
             than in a second write that could be interrupted between them. */
          beforeCreate: assignAccountNumber,
          afterCreate: sendWelcomeEmail,
        },
      }
    );
  }
  public static associate(models: any) {
    user.hasMany(models.aiInvestment, {
      as: "aiInvestments",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasOne(models.author, {
      as: "author",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.binaryOrder, {
      as: "binaryOrder",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.comment, {
      as: "comments",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.ecommerceOrder, {
      as: "ecommerceOrders",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.ecommerceReview, {
      as: "ecommerceReviews",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasOne(models.ecommerceShippingAddress, {
      as: "ecommerceShippingAddress",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.ecommerceUserDiscount, {
      as: "ecommerceUserDiscounts",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.ecommerceWishlist, {
      as: "ecommerceWishlists",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.exchangeOrder, {
      as: "exchangeOrder",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.exchangeWatchlist, {
      as: "exchangeWatchlists",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.investment, {
      as: "investments",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.kycApplication, {
      as: "kycApplications",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.mlmReferral, {
      as: "referredReferrals",
      foreignKey: "referredId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.mlmReferral, {
      as: "referrerReferrals",
      foreignKey: "referrerId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.mlmReferralReward, {
      as: "referralRewards",
      foreignKey: "referrerId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.notification, {
      as: "notifications",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.providerUser, {
      as: "providers",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.belongsTo(models.role, {
      as: "role",
      foreignKey: "roleId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.supportTicket, {
      as: "supportTickets",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.supportTicket, {
      as: "agentSupportTickets",
      foreignKey: "agentId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.transaction, {
      as: "transactions",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasOne(models.twoFactor, {
      as: "twoFactor",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.wallet, {
      as: "wallets",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    user.hasMany(models.walletPnl, {
      as: "walletPnls",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // The ICO and NFT associations were removed with those extensions. They had
    // to go: models.icoTransaction and friends no longer exist, so Sequelize
    // would be handed undefined while wiring up associations at boot.

    user.hasMany(models.userBlock, {
      as: "blocks",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      constraints: false,
    });

    user.hasMany(models.userBlock, {
      as: "adminBlocks",
      foreignKey: "adminId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      constraints: false,
    });


  }
}
