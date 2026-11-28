import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
export const root = path.resolve(import.meta.dirname, '../..');
export const pgBin = 'C:/Program Files/PostgreSQL/18/bin';
export function target() {
  const envFile = path.join(root, '.env');
  const values = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile, 'utf8')) : {};
  const raw = process.env.DIRECT_URL || values.DIRECT_URL || values.DATABASE_URL;
  let url;
  try {
    url = new URL(raw || 'https://invalid.test');
  } catch {
    throw Error('Invalid database URL; credentials redacted.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname.endsWith('.neon.tech') ||
    url.hostname.includes('-pooler') ||
    url.searchParams.has('options')
  )
    throw Error(
      'A direct Neon connection without option overrides is required.',
    );
  return {
    raw,
    url,
    identity: {
      host: url.hostname,
      database: decodeURIComponent(url.pathname.slice(1)),
    },
  };
}
export const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
export async function readClient() {
  const connection = target(),
    client = new pg.Client({
      connectionString: connection.raw,
      options: '-c default_transaction_read_only=on',
      application_name: 'nestbox-foundation-db-finalization',
      connectionTimeoutMillis: 15000,
      statement_timeout: 30000,
    });
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  if (
    (await client.query('SHOW transaction_read_only')).rows[0]
      .transaction_read_only !== 'on'
  )
    throw Error('Readonly transaction required.');
  return { client, connection };
}
export function fail(error) {
  console.error(
    JSON.stringify({
      status: 'blocked',
      code: error.code || 'FOUNDATION_DB_ERROR',
      message:
        error.safeMessage ||
        'Operation stopped. Credentials are never printed.',
    }),
  );
  process.exitCode = 1;
}
