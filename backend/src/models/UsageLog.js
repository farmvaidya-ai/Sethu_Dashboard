const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { getTableName, APP_ENV } = require('../config/tables');

const UsageLog = sequelize.define('UsageLog', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    call_sid: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    minutes_used: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'UsageLogs',
    timestamps: true,
    underscored: true
});

module.exports = UsageLog;
