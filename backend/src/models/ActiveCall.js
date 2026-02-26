const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ActiveCall = sequelize.define('ActiveCall', {
    call_sid: {
        type: DataTypes.STRING(100),
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    start_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'ActiveCalls',
    timestamps: true,
    underscored: true
});

module.exports = ActiveCall;
