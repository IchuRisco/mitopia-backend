# Prisma Schema Configuration

This directory contains Prisma schema files for different environments:

## Files

- **`schema.prisma`** - Production schema (PostgreSQL) - Used by Render deployment
- **`schema.local.prisma`** - Local development schema (SQLite) - Used for local development

## Usage

### Production (Render)
The default `schema.prisma` uses PostgreSQL and is automatically used during deployment.

### Local Development
To use SQLite for local development:

```bash
# Use local schema
cp prisma/schema.local.prisma prisma/schema.prisma

# Generate client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Reset to production schema when done
git checkout prisma/schema.prisma
```

## Environment Variables

### Production (PostgreSQL)
```env
DATABASE_URL="postgresql://username:password@host:port/database"
```

### Local Development (SQLite)
```env
DATABASE_URL="file:./dev.db"
```

## Migration Commands

### Production
```bash
npx prisma migrate deploy
```

### Local Development
```bash
npx prisma migrate dev --name init
```

## Notes

- The production schema uses PostgreSQL for better performance and scalability
- The local schema uses SQLite for easier development setup
- Both schemas have identical models and relationships
- Always test migrations locally before deploying to production
