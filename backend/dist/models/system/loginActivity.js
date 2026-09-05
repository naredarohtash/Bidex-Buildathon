"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
class loginActivity extends sequelize_1.Model {
    static initModel(sequelize) {
        return loginActivity.init({
            id: {
                type: sequelize_1.DataTypes.UUID,
                defaultValue: sequelize_1.DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            userId: {
                type: sequelize_1.DataTypes.UUID,
                allowNull: false,
            },
            sid: { type: sequelize_1.DataTypes.STRING(191), allowNull: true },
            ip: { type: sequelize_1.DataTypes.STRING(64), allowNull: true },
            userAgent: { type: sequelize_1.DataTypes.STRING(512), allowNull: true },
            browser: { type: sequelize_1.DataTypes.STRING(64), allowNull: true },
            os: { type: sequelize_1.DataTypes.STRING(64), allowNull: true },
            deviceType: { type: sequelize_1.DataTypes.STRING(32), allowNull: true },
            deviceName: { type: sequelize_1.DataTypes.STRING(128), allowNull: true },
            city: { type: sequelize_1.DataTypes.STRING(96), allowNull: true },
            region: { type: sequelize_1.DataTypes.STRING(96), allowNull: true },
            country: { type: sequelize_1.DataTypes.STRING(96), allowNull: true },
            countryCode: { type: sequelize_1.DataTypes.STRING(8), allowNull: true },
            lastSeenAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
            revokedAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
        }, {
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
        });
    }
    static associate(models) {
        loginActivity.belongsTo(models.user, {
            as: "user",
            foreignKey: "userId",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    }
}
exports.default = loginActivity;
