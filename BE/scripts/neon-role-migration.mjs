// Explicitly authorized Neon role inspection/migration. Never prints connection strings or records.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {parse} from 'dotenv';import pg from 'pg';
const action=process.argv[2]??'inspect';const root=path.resolve(import.meta.dirname,'..');
const env={...parse(fs.readFileSync(path.join(root,'.env'),'utf8')),...process.env};
const candidates=[env.DIRECT_URL,env.DATABASE_URL].filter(Boolean).filter(value=>{try{return new URL(value).hostname.endsWith('.neon.tech');}catch{return false;}});
if(!candidates.length)throw new Error('No Neon connection found. Refusing other providers.');
const client=new pg.Client({connectionString:candidates[0],connectionTimeoutMillis:15000,statement_timeout:30000});
const migrationName=action==='apply-foundation'?'20261123000200_facility_access_foundation':'20261123000100_five_role_codes';
const migration=path.join(root,'prisma/migrations',migrationName,'migration.sql');
try{
await client.connect();
if(action==='inspect'){
 await client.query('BEGIN READ ONLY');
 const labels=await client.query("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='UserRole' ORDER BY e.enumsortorder");
 const counts=await client.query('SELECT role::text AS role, count(*)::int AS count FROM "User" GROUP BY role ORDER BY role::text');
 const columns=await client.query("SELECT c.relname AS table_name,a.attname AS column_name FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.typname='UserRole' AND n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped");
 await client.query('COMMIT');console.log(JSON.stringify({provider:'Neon',labels:labels.rows.map(x=>x.enumlabel),counts:counts.rows,enumColumns:columns.rows}));
}else if((action==='apply'||action==='apply-foundation')){
 const backupDir='D:/NestBox-private-backups';fs.mkdirSync(backupDir,{recursive:true});
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await client.query("SELECT 1 FROM pg_advisory_xact_lock(hashtext('nestbox-role-rename-v1'))");
 await client.query('LOCK TABLE "User", "AuthSession", "AuditEvent" IN SHARE ROW EXCLUSIVE MODE');
 const tables=await client.query("SELECT DISTINCT c.relname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.typname='UserRole' AND n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped");
 const backup={createdAt:new Date().toISOString(),reason:'UserRole rename; account IDs and all records preserved',tables:{}};
 for(const name of new Set([...tables.rows.map(x=>x.relname),'User','AuthSession','AuditEvent','Facility'])){
 const safe='"'+name.replaceAll('"','""')+'"';backup.tables[name]=(await client.query('SELECT * FROM '+safe)).rows;
 }
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(backup)),cipher.final()]);
 const name=path.join(backupDir,'before-five-roles-'+new Date().toISOString().replaceAll(/[:.]/g,'-'));
 fs.writeFileSync(name+'.key',key,{mode:0o600,flag:'wx'});
 fs.writeFileSync(name+'.enc',Buffer.concat([iv,cipher.getAuthTag(),bytes]),{mode:0o600,flag:'wx'});
 // Verify the encrypted backup is readable before any DDL.
 const saved=fs.readFileSync(name+'.enc');const decipher=crypto.createDecipheriv('aes-256-gcm',fs.readFileSync(name+'.key'),saved.subarray(0,12));decipher.setAuthTag(saved.subarray(12,28));
 const verified=JSON.parse(Buffer.concat([decipher.update(saved.subarray(28)),decipher.final()]).toString());
 if(verified.tables.User.length!==backup.tables.User.length)throw new Error('Backup verification failed');
 const originalIds=new Set(backup.tables.User.map(x=>x.id));
 const content=fs.readFileSync(migration,'utf8');await client.query(content);
 const after=await client.query('SELECT id,role::text FROM "User"');
 if(after.rowCount!==originalIds.size||after.rows.some(x=>!originalIds.has(x.id)))throw new Error('Account identity verification failed');
 const allowed=new Set(['STORAGE_CUSTOMER','FACILITY_STAFF','FACILITY_MANAGER','BUSINESS_OPERATIONS_MANAGER','SYSTEM_ADMINISTRATOR']);
 if(after.rows.some(x=>!allowed.has(x.role)))throw new Error('Unexpected role after migration');
 const checksum=crypto.createHash('sha256').update(content).digest('hex');
 const history=await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists");
 if(history.rows[0].exists)await client.query('INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,started_at,applied_steps_count) SELECT $1::varchar,$2::varchar,NOW(),$3::varchar,NOW(),1 WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name=$3::varchar AND rolled_back_at IS NULL)',[crypto.randomUUID(),checksum,migrationName]);
 await client.query('COMMIT');
 console.log(JSON.stringify({applied:true,backup:name+'.enc',keyFile:name+'.key',accountsPreserved:originalIds.size,migration:migrationName}));
}else throw new Error('Unsupported operation');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({errorCode:error.code??'ROLE_MIGRATION_FAILED',position:error.position,routine:error.routine,message:'Operation stopped; inspect securely. No credentials printed.'}));process.exitCode=1;}finally{await client.end();}
