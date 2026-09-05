"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
class bonusRedemption extends sequelize_1.Model {
    static initModel(sequelize) {
        return bonusRedemption.init({
            id: {
                type: sequelize_1.DataTypes.UUID,
                defaultValue: sequelize_1.DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            bonusCodeId: { type: sequelize_1.DataTypes.UUID, allowNull: false },
            userId: { type: sequelize_1.DataTypes.UUID, allowNull: false },
            transactionId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
                unique: "bonusRedemptionTransactionKey",
            },
            amount: { type: sequelize_1.DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
            depositAmount: { type: sequelize_1.DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
        }, {
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
                {
                    name: "bonusRedemptionCodeUserIdx",
                    using: "BTREE",
                    fields: [{ name: "bonusCodeId" }, { name: "userId" }],
                },
            ],
        });
    }
}
exports.default = bonusRedemption;
