import { Table, Column, Model, ForeignKey } from 'sequelize-typescript'
import { Event } from './Event';
import { Query } from './Query';

@Table({
  underscored: true
})
export class QueryEvent extends Model {
  @ForeignKey(() => Query)
  @Column
  queryId: number;

  @ForeignKey(() => Event)
  @Column
  eventId: number;
}