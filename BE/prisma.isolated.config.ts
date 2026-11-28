import {defineConfig} from 'prisma/config';
const raw=process.env.NESTBOX_TEST_DATABASE_URL??'';
const expected='postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if(process.env.NESTBOX_ISOLATED_TEST!=='1'||raw!==expected||process.env.DATABASE_URL!==expected||process.env.DIRECT_URL!==expected)throw new Error('Only the disposable local foundation database is allowed.');
export default defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},datasource:{url:raw}});
