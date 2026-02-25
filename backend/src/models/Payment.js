const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { getTableName, APP_ENV } = require('../config/tables');

const Payment = sequelize.define('Payment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    amount: {
        type: DataTypes.INTEGER, // in paise
        allowNull: false
    },
    currency: {
        type: DataTypes.STRING(10),
        defaultValue: 'INR'
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'created'
    },
    order_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    payment_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    type: {
        type: DataTypes.STRING(20), // 'subscription' | 'minutes'
        allowNull: false
    },
    minutes_added: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'Payments',
    timestamps: true,
    underscored: true
});

module.exports = Payment;
