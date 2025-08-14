# Deployment Guide for Construction Management System

## 🚀 Deployment Optimizations Applied

This application has been optimized for production deployment on Replit with Supabase PostgreSQL.

### ✅ Core Optimizations Implemented

1. **Fast Healthcheck Endpoint**
   - Added `/healthz` endpoint that responds with 200 status and "ok" message
   - Returns instantly without database queries
   - Use this as your deployment healthcheck path

2. **Supabase Connection Optimizations**
   - Configured postgres.js with `prepare: false` for PgBouncer transaction pooling compatibility
   - Optimized connection pool settings: max=5, idle_timeout=5s, connect_timeout=10s
   - SSL required for secure connections
   - Singleton database connection pattern prevents connection leaks

3. **Server Configuration**
   - Added proper timeout configuration: `headersTimeout=65s`, `requestTimeout=60s`
   - Graceful shutdown handlers for SIGTERM/SIGINT with database cleanup
   - PORT environment variable support with fallback to 5000

4. **Request Timeout Protection**
   - Added timeout wrapper for database operations (25s default)
   - Prevents platform timeouts on slow queries
   - Returns 408 status for timeout errors with user-friendly messages

5. **Startup Optimization**
   - Deferred sample data initialization to not block server startup
   - Early logging for faster deployment diagnosis
   - Non-blocking database initialization

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Supabase Connection (use transaction pooler for better performance)
DATABASE_URL=postgresql://<user>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require

# Optional: Port configuration
PORT=5000
```

### Supabase Connection Options

**Option 1: Transaction Pooler (Recommended)**
- URL: `postgresql://...:6543/postgres`
- Better for deployment resource efficiency
- Prepared statements disabled (handled automatically)

**Option 2: Session Pooler**
- URL: `postgresql://...:5432/postgres`  
- More resource intensive but supports prepared statements

## 📋 Deployment Checklist

### Pre-deployment
- [ ] Ensure `DATABASE_URL` is set with Supabase transaction pooler (port 6543)
- [ ] Run `npm run db:push` to apply schema changes (NOT during runtime)
- [ ] Test locally with `npm run build && npm run start`

### Deployment Configuration
- [ ] Set healthcheck path to `/healthz`
- [ ] Set healthcheck timeout to 10 seconds
- [ ] Ensure PORT environment variable is configured
- [ ] Deploy with build command: `npm run build`
- [ ] Deploy with start command: `npm run start`

### Post-deployment Verification
- [ ] Check `/healthz` returns 200 status within 10 seconds
- [ ] Verify no repeating crashes in deployment logs
- [ ] Test login functionality at `/api/auth/login`
- [ ] Monitor memory usage for connection leaks

## 🐛 Troubleshooting

### Common Issues

**Slow startup / healthcheck failures:**
- Check database connection string uses correct pooler port (6543 vs 5432)
- Verify SSL is enabled in connection string (`?sslmode=require`)
- Check deployment logs for connection errors

**Request timeouts:**
- Large data operations now have 25s timeout with user feedback
- Check for slow queries in Supabase dashboard
- Consider pagination for large dataset endpoints

**Connection errors:**
- Ensure Supabase project is not paused
- Verify connection string credentials are correct
- Check if connection limits are reached in Supabase dashboard

### Monitoring Commands

```bash
# Test healthcheck
curl -s http://your-app.replit.app/healthz

# Test API functionality
curl -s http://your-app.replit.app/api/users

# Check connection pooler type
echo $DATABASE_URL | grep -o ":6543\|:5432"
```

## 🔗 Related Resources

- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Replit Deployment Documentation](https://docs.replit.com/hosting/deployments)
- [Node.js Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

All optimizations follow deployment best practices for Node.js + Express + Supabase stack with PgBouncer compatibility.