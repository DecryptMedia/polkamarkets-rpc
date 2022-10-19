import { Table, Column, Model, DataType, BelongsToMany } from 'sequelize-typescript'
import { Event } from './Event';
import { QueryEvent } from './QueryEvent';

@Table({
  underscored: true
})
export class Query extends Model {

  @Column
  contract: string;

  @Column
  address: string;

  @Column
  eventName: string;

  @Column(DataType.TEXT)
  filter: string;

  @Column(DataType.BIGINT)
  lastBlock: number;

  @BelongsToMany(() => Event, () => QueryEvent)
  events: Array<Event & { QueryEvent }>;
}