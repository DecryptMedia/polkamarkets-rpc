import express from 'express';
import cors from 'cors';

import { router } from './routes';
import { queuesPath, queuesRouter } from './queues';
import { sequelize } from './sequelize';
const app = express();

app.use(cors());
app.use(express.json());
app.use(router);
app.use(queuesPath, queuesRouter);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

testConnection();

export { app };
