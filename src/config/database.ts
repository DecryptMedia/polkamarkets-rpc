import 'dotenv/config';
import { Dialect } from 'sequelize';

const config = {
  dialect: <Dialect>'postgres',
  username: process.env.DB_USERNAME || 'beproapi_user',
  password: process.env.DB_PASSWORD || 'beproapi',
  database: process.env.DB_DATABASE || 'beproapi',
  host: process.env.DB_HOST || 'localhost',
  port: <any>process.env.DB_PORT || 5432,
};

// export has to be like this for migrations to work
module.exports = config;

