# GYDS Feature Gate Service

A standalone Express service for managing feature gates with wallet-based admin authentication.

## Setup

1. **Install dependencies:**
   ```bash
   cd feature-gate-service
   npm install
   ```

2. **Configure environment:**
   Add to your root `.env` file:
   ```
   FEATURE_GATE_PORT=3002
   ```

3. **Set up database tables:**
   ```bash
   npm run setup-db
   ```
   Or run the SQL from `setup-db.js` directly in pgAdmin.

4. **Add your admin wallet address in pgAdmin:**
   ```sql
   UPDATE admin_wallets 
   SET wallet_address = '0xYOUR_ACTUAL_WALLET_ADDRESS' 
   WHERE id = 1;
   ```

5. **Start the service:**
   ```bash
   npm start
   ```

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────┐
│   Frontend   │────▶│ Feature Gate Service  │────▶│ PostgreSQL │
│  (React App) │     │   (Express :3002)     │     │  (pgAdmin) │
└─────────────┘     └──────────────────────┘     └────────────┘
```

## Auth Flow

1. Admin clicks "Admin Login" → connects GYDS wallet
2. Frontend requests nonce from service
3. Wallet signs the nonce message
4. Service verifies signature against `admin_wallets` table
5. JWT issued (24h expiry) for subsequent API calls

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/feature-gates` | Public | List all feature gates |
| PUT | `/api/feature-gates/:id` | Admin | Toggle a feature gate |
| POST | `/api/auth/nonce` | Public | Request auth nonce |
| POST | `/api/auth/verify` | Public | Verify signature, get JWT |
| GET | `/api/auth/me` | Admin | Current admin info |
| GET | `/api/health` | Public | Health check |

## PM2 Deployment

```bash
pm2 start server.js --name gyds-feature-gates
```
