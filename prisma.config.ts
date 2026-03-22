import path from 'node:path'
import { defineConfig } from 'prisma/config'

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goaldash:goaldash@localhost:5433/goaldash'

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    seed: 'npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
})
