#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/65b7c2414df7b1a8d06ed70c67ed7b9d4661823261539d0cd4c04fffae19c2ab/contract';
import startContract from '../../snapshots/65b7c2414df7b1a8d06ed70c67ed7b9d4661823261539d0cd4c04fffae19c2ab/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8accdfe9233a3fe67d414d5546ddec60061559f8b08f450425134d0fdf6e9268/contract';
import endContract from '../../snapshots/8accdfe9233a3fe67d414d5546ddec60061559f8b08f450425134d0fdf6e9268/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'File',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('meetingId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mimeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('originalName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('size', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('storedName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('uploaderId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'File',
        index: 'File_meetingId_createdAt_idx_59cb58d2',
        columns: ['meetingId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'File',
        index: 'File_meetingId_idx_ebb79f08',
        columns: ['meetingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'File',
        index: 'File_uploaderId_idx_debae170',
        columns: ['uploaderId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'File',
        foreignKey: {
          name: 'File_meetingId_fkey',
          columns: ['meetingId'],
          references: { schema: 'public', table: 'Meeting', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'File',
        foreignKey: {
          name: 'File_uploaderId_fkey',
          columns: ['uploaderId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
