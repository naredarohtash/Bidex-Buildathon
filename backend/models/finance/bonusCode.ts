import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";

/**
 * A deposit bonus code.
 *
 * Replaces a set of codes defined in an environment variable, which could
 * describe a percentage and a cap and nothing else — no expiry, no limit on how
 * many times one person could claim it, and no record of what had been paid
 * out. A promotion you cannot switch off, cannot count, and cannot stop someone
 * running twenty times is not a promotion, it is a leak.
 *
 * The conditions here are the ones that decide whether a promotion costs what
 * was budgeted:
 *
 *   value + type      what it pays — a percentage of the deposit, or a flat sum
 *   minDeposit        the smallest deposit that qualifies
 *   maxBonus          the most one claim may pay (0 = uncapped)
 *   maxUsesPerUser    how often ONE person may claim it (0 = unlimited)
 *   maxUsesTotal      how often EVERYONE may claim it (0 = unlimited)
 *   firstDepositOnly  new depositors only
 *   allowedMethods    restrict to certain rails (null = any)
 *   startsAt/expiresAt   when it is live
 *   status            an off switch that does not require deleting anything
 *
 * usedCount and totalPaidOut are maintained as claims settle, so the cost of a
 * campaign is visible while it is running rather than reconstructed afterwards.
 */
export default class bonusCode extends Model {
  id!: string;
  code!: string;
  description?: string;
  type!: "PERCENTAGE" | "FIXED";
  value!: number;
  minDeposit!: number;
  maxBonus!: number;
  maxUsesTotal!: number;
  maxUsesPerUser!: number;
  firstDepositOnly!: boolean;
  allowedMethods?: string[] | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  status!: boolean;
  usedCount!: number;
  totalPaidOut!: number;

  public static initModel(sequelize: Sequelize.Sequelize): typeof bonusCode {
    return bonusCode.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        code: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: "bonusCodeCodeKey",
          validate: { notEmpty: { msg: "code: Code must not be empty" } },
        },
        description: { type: DataTypes.STRING(191), allowNull: true },
        type: {
          type: DataTypes.ENUM("PERCENTAGE", "FIXED"),
          allowNull: false,
          defaultValue: "PERCENTAGE",
        },
        value: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          validate: { min: { args: [0], msg: "value: Value cannot be negative" } },
        },
        minDeposit: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
        /** 0 means uncapped. */
        maxBonus: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
        /** 0 means unlimited. */
        maxUsesTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        /* Defaults to one. A code that can be claimed repeatedly by the same
           person is the expensive mistake, so the safe value is the default and
           unlimited has to be chosen deliberately. */
        maxUsesPerUser: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        firstDepositOnly: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        /** null = every method. Otherwise a list of deposit method ids. */
        allowedMethods: { type: DataTypes.JSON, allowNull: true },
        startsAt: { type: DataTypes.DATE, allowNull: true },
        expiresAt: { type: DataTypes.DATE, allowNull: true },
        status: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        totalPaidOut: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      },
      {
        sequelize,
        modelName: "bonusCode",
        tableName: "bonus_code",
        timestamps: true,
        indexes: [
          { name: "bonusCodeCodeKey", unique: true, using: "BTREE", fields: [{ name: "code" }] },
          { name: "bonusCodeStatusIdx", using: "BTREE", fields: [{ name: "status" }] },
        ],
      }
    );
  }
}
