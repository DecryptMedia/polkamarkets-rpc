import { Table, Column, Model, DataType, BelongsToMany } from 'sequelize-typescript'
import { Query } from './Query';
import { QueryEvent } from './QueryEvent';

@Table({
  underscored: true
})
export class Event extends Model {
  @Column
  address: string;

  @Column
  blockHash: string;

  @Column(DataType.BIGINT)
  blockNumber: number;

  @Column(DataType.BIGINT)
  logIndex: number;

  @Column
  removed: boolean;

  @Column
  transactionHash: string;

  @Column(DataType.BIGINT)
  transactionIndex: number;

  @Column
  transactionLogIndex: string;

  @Column
  eventId: string

  @Column(DataType.JSONB)
  returnValues: any;

  @Column
  event: string;

  @Column
  signature: string;

  @Column(DataType.JSONB)
  raw: any;

  @BelongsToMany(() => Query, () => QueryEvent)
  queries: Array<Query & { QueryEvent }>;
}