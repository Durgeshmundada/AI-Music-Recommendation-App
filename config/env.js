require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/musicrecommendation',
  JWT_SECRET: process.env.JWT_SECRET || 'defaultSecretKey',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000/api',
};
