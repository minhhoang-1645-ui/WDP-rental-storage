import {defineConfig} from 'vitest/config';
export default defineConfig({test:{globals:true,environment:'node',include:['test/core-foundation.integration.spec.ts','test/core-foundation.http.spec.ts','test/manual-operations.pg.spec.ts','test/closure-relocation.integration.spec.ts'],fileParallelism:false,testTimeout:45000,hookTimeout:45000}});
