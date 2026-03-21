import path from 'node:path'
import { defineConfig } from 'prisma/config'

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/goal_dashboard'

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
  migrate: {
    async development() {
      return {
        url: databaseUrl,
      }
    },
  },
})
