#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/65b7c2414df7b1a8d06ed70c67ed7b9d4661823261539d0cd4c04fffae19c2ab/contract';
import endContract from '../../snapshots/65b7c2414df7b1a8d06ed70c67ed7b9d4661823261539d0cd4c04fffae19c2ab/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a58be078e817db049f202701726a751305d5f73c390b5e0266d4174d303e4ce1/contract';
import startContract from '../../snapshots/a58be078e817db049f202701726a751305d5f73c390b5e0266d4174d303e4ce1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Meeting',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('hostId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Meeting',
        index: 'Meeting_hostId_idx_05205577',
        columns: ['hostId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Meeting',
        foreignKey: {
          name: 'Meeting_hostId_fkey',
          columns: ['hostId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
