"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
class bonusCode extends sequelize_1.Model {
    static initModel(sequelize) {
        return bonusCode.init({
            id: {
                type: sequelize_1.DataTypes.UUID,
                defaultValue: sequelize_1.DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            code: {
                type: sequelize_1.DataTypes.STRING(64),
                allowNull: false,
                unique: "bonusCodeCodeKey",
                validate: { notEmpty: { msg: "code: Code must not be empty" } },
            },
            description: { type: sequelize_1.DataTypes.STRING(191), allowNull: true },
            type: {
                type: sequelize_1.DataTypes.ENUM("PERCENTAGE", "FIXED"),
                allowNull: false,
                defaultValue: "PERCENTAGE",
            },
            value: {
                type: sequelize_1.DataTypes.DOUBLE,
                allowNull: false,
                validate: { min: { args: [0], msg: "value: Value cannot be negative" } },
            },
            minDeposit: { type: sequelize_1.DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
            maxBonus: { type: sequelize_1.DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
            maxUsesTotal: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            maxUsesPerUser: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            firstDepositOnly: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            allowedMethods: { type: sequelize_1.DataTypes.JSON, allowNull: true },
            startsAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
            expiresAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
            status: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            usedCount: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            totalPaidOut: { type: sequelize_1.DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
        }, {
            sequelize,
            modelName: "bonusCode",
            tableName: "bonus_code",
            timestamps: true,
            indexes: [
                { name: "bonusCodeCodeKey", unique: true, using: "BTREE", fields: [{ name: "code" }] },
                { name: "bonusCodeStatusIdx", using: "BTREE", fields: [{ name: "status" }] },
            ],
        });
    }
}
exports.default = bonusCode;
