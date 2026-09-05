import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";

/**
 * One row per sign-in, per device.
 *
 * This table exists because the server had nowhere to put the answer to the
 * only question the security page is really asked: is anybody else in my
 * account? Sessions live in Redis and hold a user id, a role and a set of
 * tokens — no device, no time, no place — and they vanish when they expire, so
 * even a perfect reading of Redis could not show a sign-in from last Tuesday.
 * The earlier security page filled that hole with a hardcoded array and was
 * deleted for it. This is the same information, actually recorded.
 *
 * `sid` is the Redis session id, which is what makes a row *current* rather
 * than historical: if `sessionId:<sid>` still exists, that device is signed in
 * right now. When the key goes — expiry, sign-out, or a revoke from this page —
 * the row stays as history and simply stops being active.
 *
 * Nothing here is derived or guessed. The IP and the user agent are read off
 * the request by the server; the place is resolved from that IP once, at
 * recording time, and stored. Where a lookup fails the columns stay null and
 * the page says so.
 */

interface LoginActivityRow {
  id: string;
  userId: string;
  sid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceName?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lastSeenAt?: Date | null;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type LoginActivityNew = Omit<LoginActivityRow, "id"> & { id?: string };

export default class loginActivity
  extends Model<LoginActivityRow, LoginActivityNew>
  implements LoginActivityRow
{
  id!: string;
  userId!: string;
  sid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceName?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lastSeenAt?: Date | null;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;

  public static initModel(sequelize: Sequelize.Sequelize): typeof loginActivity {
    return loginActivity.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        /* The Redis session id. Null once a row is purely historical, which is
           also how a revoked device is told apart from an expired one. */
        sid: { type: DataTypes.STRING(191), allowNull: true },
        ip: { type: DataTypes.STRING(64), allowNull: true },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        browser: { type: DataTypes.STRING(64), allowNull: true },
        os: { type: DataTypes.STRING(64), allowNull: true },
        deviceType: { type: DataTypes.STRING(32), allowNull: true },
        deviceName: { type: DataTypes.STRING(128), allowNull: true },
        city: { type: DataTypes.STRING(96), allowNull: true },
        region: { type: DataTypes.STRING(96), allowNull: true },
        country: { type: DataTypes.STRING(96), allowNull: true },
        countryCode: { type: DataTypes.STRING(8), allowNull: true },
        lastSeenAt: { type: DataTypes.DATE, allowNull: true },
        revokedAt: { type: DataTypes.DATE, allowNull: true },
      },
      {
        sequelize,
        modelName: "loginActivity",
        tableName: "login_activity",
        timestamps: true,
        paranoid: false,
        indexes: [
          { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "id" }] },
          { name: "loginActivityUserIdIdx", using: "BTREE", fields: [{ name: "userId" }] },
          { name: "loginActivitySidIdx", using: "BTREE", fields: [{ name: "sid" }] },
        ],
      }
    );
  }

  public static associate(models: any) {
    loginActivity.belongsTo(models.user, {
      as: "user",
      foreignKey: "userId",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  }
}
