import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";

/**
 * One claim of one bonus code.
 *
 * Kept as rows rather than a counter on the code, for two reasons. Per-user
 * limits need to know who claimed, not just how many times — a counter cannot
 * answer "has this person used it before". And when a promotion overruns its
 * budget, the question is always which deposits it went to; a number cannot
 * answer that either.
 *
 * The unique constraint on transactionId is the real guard. Per-user limits are
 * checked before crediting, but a check followed by an insert is a race: two
 * settlements of the same deposit could both read "0 uses" and both pay. The
 * database refuses the second write regardless of what the code believed.
 */
export default class bonusRedemption extends Model {
  id!: string;
  bonusCodeId!: string;
  userId!: string;
  transactionId!: string;
  /** What was actually paid, in USDT. */
  amount!: number;
  depositAmount!: number;

  public static initModel(sequelize: Sequelize.Sequelize): typeof bonusRedemption {
    return bonusRedemption.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        bonusCodeId: { type: DataTypes.UUID, allowNull: false },
        userId: { type: DataTypes.UUID, allowNull: false },
        transactionId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: "bonusRedemptionTransactionKey",
        },
        amount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
        depositAmount: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      },
      {
        sequelize,
        modelName: "bonusRedemption",
        tableName: "bonus_redemption",
        timestamps: true,
        indexes: [
          {
            name: "bonusRedemptionTransactionKey",
            unique: true,
            using: "BTREE",
            fields: [{ name: "transactionId" }],
          },
          // The per-user limit check reads exactly this pair.
          {
            name: "bonusRedemptionCodeUserIdx",
            using: "BTREE",
            fields: [{ name: "bonusCodeId" }, { name: "userId" }],
          },
        ],
      }
    );
  }
}
