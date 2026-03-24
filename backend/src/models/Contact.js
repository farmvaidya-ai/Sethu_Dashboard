const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { getTableName } = require('../config/tables');

const Contact = sequelize.define('Contact', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    agent_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    mobile_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: DataTypes.STRING,
    village: DataTypes.STRING,
    mandal: DataTypes.STRING,
    district: DataTypes.STRING,
    pincode: DataTypes.STRING,
    state: DataTypes.STRING
}, {
    tableName: getTableName('Contacts'),
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['agent_id', 'mobile_number']
        }
    ]
});

module.exports = Contact;
