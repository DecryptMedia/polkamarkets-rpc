require('pg').defaults.parseInt8 = true
import { Sequelize } from 'sequelize-typescript';
import * as databaseConfig from './config/database';

export const sequelize = new Sequelize({
  ...databaseConfig,
  models: [__dirname + '/models'],
  logging: false
});
