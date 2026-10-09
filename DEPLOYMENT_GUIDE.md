# 📋 DEPLOYMENT & PRODUCTION READINESS GUIDE

## Pre-Deployment Checklist

### 1. Security Hardening ✅

- [ ] **Secrets Management**
  - [ ] Generate new JWT_SECRET: `openssl rand -base64 32`
  - [ ] Generate new JWT_REFRESH_SECRET: `openssl rand -base64 32`
  - [ ] Store secrets in environment variables (not in code)
  - [ ] Use AWS Secrets Manager, Hashicorp Vault, or similar
  - [ ] Rotate secrets every 90 days
  - [ ] Never commit `.env` file to Git

- [ ] **CORS Configuration**
  - [ ] Set specific ALLOWED_ORIGINS (not wildcard)
  - [ ] Domain whitelist all legitimate frontends
  - [ ] Verify credentials: true is necessary

- [ ] **HTTPS/TLS**
  - [ ] Obtain SSL certificate (Let's Encrypt or paid)
  - [ ] Enforce HTTPS redirect
  - [ ] Set HSTS header
  - [ ] Use TLS 1.2+

- [ ] **Rate Limiting**
  - [ ] Auth endpoints: 5 attempts per 15 minutes
  - [ ] Register endpoint: 3 per day per IP
  - [ ] Search endpoint: 100 per minute per user
  - [ ] Adjust based on expected load

- [ ] **Authentication**
  - [ ] Tokens stored in HttpOnly cookies
  - [ ] Refresh token mechanism implemented
  - [ ] Logout clears cookies
  - [ ] Token TTL: 15 minutes (access), 7 days (refresh)

- [ ] **Input Validation**
  - [ ] All endpoints validate input
  - [ ] Regex patterns escape special characters
  - [ ] File upload size limits enforced
  - [ ] Type checking on all requests

- [ ] **Database Security**
  - [ ] MongoDB authentication enabled
  - [ ] IP whitelist configured
  - [ ] Backup encryption enabled
  - [ ] No public internet access

### 2. Performance & Scalability ✅

- [ ] **Caching**
  - [ ] Redis configured and tested
  - [ ] Recommendation cache with 1-hour TTL
  - [ ] Database query results cached
  - [ ] Cache invalidation implemented

- [ ] **Database**
  - [ ] All indexes created
  - [ ] Query performance tested (under 100ms)
  - [ ] Connection pooling configured (max 10)
  - [ ] Pagination limits enforced

- [ ] **API**
  - [ ] Request size limits: 1MB
  - [ ] Response compression enabled (gzip)
  - [ ] Timeout handling implemented
  - [ ] Request queuing for heavy operations

- [ ] **Async Processing**
  - [ ] Bull job queue configured
  - [ ] Recommendation generation async
  - [ ] Background tasks implemented
  - [ ] Retry logic with exponential backoff

### 3. Monitoring & Observability ✅

- [ ] **Logging**
  - [ ] Winston logger configured
  - [ ] Error logs separated from access logs
  - [ ] Log rotation (keep 5 files max)
  - [ ] Sensitive data not logged (passwords, tokens)

- [ ] **Error Tracking**
  - [ ] Sentry or Datadog configured
  - [ ] Error grouping by type
  - [ ] Alerts for critical errors
  - [ ] Stack traces available

- [ ] **Metrics**
  - [ ] Response time metrics
  - [ ] Database query metrics
  - [ ] Cache hit/miss ratios
  - [ ] User activity metrics
  - [ ] Error rate tracking

- [ ] **Health Checks**
  - [ ] `/api/health` endpoint working
  - [ ] Database connectivity checked
  - [ ] Redis connectivity checked
  - [ ] Monitored by alerting system

### 4. Reliability ✅

- [ ] **Error Handling**
  - [ ] All endpoints have try-catch
  - [ ] Database errors gracefully handled
  - [ ] External API failures don't crash app
  - [ ] Circuit breaker pattern implemented

- [ ] **Backup & Recovery**
  - [ ] Database automated backups (daily)
  - [ ] Backups tested for restorability
  - [ ] RTO: 1 hour, RPO: 1 day
  - [ ] Disaster recovery plan documented

- [ ] **Graceful Shutdown**
  - [ ] In-flight requests complete
  - [ ] Database connections closed
  - [ ] Cache connections flushed
  - [ ] Graceful timeout: 30 seconds

### 5. Compliance & Privacy ✅

- [ ] **Data Protection**
  - [ ] GDPR compliance (if EU users)
  - [ ] CCPA compliance (if CA users)
  - [ ] Data encryption in transit (HTTPS)
  - [ ] Data encryption at rest (database)
  - [ ] PII not logged or exposed

- [ ] **Privacy Policy**
  - [ ] Clear privacy policy
  - [ ] User consent mechanism
  - [ ] Data retention policy
  - [ ] User deletion endpoint

- [ ] **Audit Logging**
  - [ ] Authentication attempts logged
  - [ ] Admin actions logged
  - [ ] Data exports logged
  - [ ] 90-day retention

### 6. Testing ✅

- [ ] **Unit Tests**
  - [ ] Controllers tested
  - [ ] Services tested
  - [ ] Utilities tested
  - [ ] >80% coverage

- [ ] **Integration Tests**
  - [ ] API endpoints tested
  - [ ] Database interactions tested
  - [ ] Cache interactions tested
  - [ ] Auth flows tested

- [ ] **End-to-End Tests**
  - [ ] User registration tested
  - [ ] Login flow tested
  - [ ] Recommendation generation tested
  - [ ] Playlist operations tested

- [ ] **Security Tests**
  - [ ] SQL/NoSQL injection testing
  - [ ] XSS vulnerability testing
  - [ ] CSRF protection tested
  - [ ] Rate limiting tested
  - [ ] Authentication bypass testing

- [ ] **Performance Tests**
  - [ ] Load test (1000 concurrent users)
  - [ ] Stress test (peak capacity)
  - [ ] Soak test (24-hour continuous)
  - [ ] Response times < 200ms (P95)

### 7. Deployment ✅

- [ ] **Infrastructure**
  - [ ] Cloud provider selected (AWS, GCP, Azure)
  - [ ] Auto-scaling configured
  - [ ] Load balancer configured
  - [ ] CDN configured (optional)
  - [ ] DNS configured

- [ ] **CI/CD Pipeline**
  - [ ] GitHub Actions/GitLab CI configured
  - [ ] Automated tests run on push
  - [ ] Linting and formatting checks
  - [ ] Build step automated
  - [ ] Deployment automated

- [ ] **Environment Management**
  - [ ] Development environment
  - [ ] Staging environment
  - [ ] Production environment
  - [ ] Environment parity verified

- [ ] **Documentation**
  - [ ] API documentation (Swagger/OpenAPI)
  - [ ] Deployment runbook
  - [ ] Incident response plan
  - [ ] Architecture diagrams
  - [ ] Team runbooks

## Installation & Setup

### Prerequisites
```bash
# Node.js 16+
node --version

# npm 8+
npm --version

# Docker (optional but recommended)
docker --version

# MongoDB
# Local: mongod running
# Cloud: MongoDB Atlas connection string

# Redis
# Local: redis-server running
# Cloud: Redis Cloud or ElastiCache
```

### Installation Steps

```bash
# 1. Clone repository
git clone https://github.com/yourname/music-recommender.git
cd music-recommender

# 2. Install dependencies
npm install

# 3. Create .env file with production values
cp .env.example .env
# Edit .env with production secrets

# 4. Run migrations
npm run migrate

# 5. Seed database (optional)
npm run seed

# 6. Run tests
npm test

# 7. Start server
npm start
```

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 5000

# Run application
CMD ["node", "server.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017/musicrecommendation
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongo
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: musicrecommendation

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
```

## Production Secrets Pattern

**DO NOT** commit secrets to Git. Use environment variables:

```bash
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id music-recommender/prod

# GitHub Actions
# 1. Go to Settings > Secrets and Variables > Actions
# 2. Add:
#    - MONGODB_URI
#    - JWT_SECRET
#    - JWT_REFRESH_SECRET
#    - REDIS_URL

# GitLab CI
# 1. Go to Settings > CI/CD > Variables
# 2. Add same secrets as above

# Kubernetes Secrets
kubectl create secret generic app-secrets \
  --from-literal=MONGODB_URI=$MONGODB_URI \
  --from-literal=JWT_SECRET=$JWT_SECRET
```

## Monitoring & Alerting

### Key Metrics to Monitor

```
- API response time (target: <200ms P95)
- Error rate (target: <0.1%)
- Database query duration (target: <50ms avg)
- Cache hit ratio (target: >70%)
- Memory usage (target: <500MB)
- CPU usage (target: <70%)
- Disk usage (target: <80%)
```

### Alert Thresholds

```
- CPU > 80% for 5 minutes
- Memory > 80% for 5 minutes
- Error rate > 1%
- API response time > 1 second (P95)
- Database connectivity lost
- Redis connectivity lost
- Disk usage > 90%
```

## Incident Response

### Critical Issues

1. **Database Down**
   - Page on-call engineer
   - Failover to replica if available
   - Enable read-only mode if needed
   - ETA: 15 minutes

2. **API Crash**
   - Auto-restart via container orchestration
   - Page on-call engineer
   - Roll back last deployment
   - ETA: 5 minutes

3. **Security Breach**
   - Immediately rotate secrets
   - Review logs for unauthorized access
   - Notify affected users
   - File incident report

## Rollback Procedure

```bash
# If deployment fails, rollback to previous version:

# 1. Check deployment history
kubectl rollout history deployment/music-recommender

# 2. Rollback to previous version
kubectl rollout undo deployment/music-recommender

# 3. Verify health
curl https://api.musicrecommender.com/api/health
```

## Ongoing Maintenance

### Weekly
- [ ] Review error logs
- [ ] Check database size growth
- [ ] Verify backups run successfully

### Monthly
- [ ] Security updates (npm audit)
- [ ] Performance analysis
- [ ] Cost review

### Quarterly
- [ ] Security audit
- [ ] Load testing
- [ ] Disaster recovery drill
- [ ] Secret rotation

---

**For questions or issues, contact:** devops@musicrecommender.com
