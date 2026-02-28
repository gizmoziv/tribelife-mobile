# TribeLife Mobile — Setup Guide

## Prerequisites

- Node.js 20+
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli eas-cli`
- PostgreSQL database (shared with webapp or new DigitalOcean Managed Database)
- An Anthropic API key
- A Google Cloud project

---

## Step 1 — Google OAuth Setup

### 1.1 Create a Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → name it "TribeLife"
3. Select the project

### 1.2 Enable Google Sign-In API
1. Go to **APIs & Services → Library**
2. Search for **"Google Identity"** → Enable

### 1.3 Configure OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**
2. Choose **External**
3. Fill in:
   - App name: `TribeLife`
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`, `openid`
5. Save

### 1.4 Create OAuth Credentials

**Web client** (used by backend to verify tokens):
1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `TribeLife Web`
4. Copy **Client ID** and **Client Secret** → goes in `tribelife-backend/.env`

**iOS client**:
1. Create another OAuth 2.0 Client ID
2. Application type: **iOS**
3. Bundle ID: `com.tribelife.app`
4. Copy **Client ID** → goes in `tribelife-mobile/.env` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
5. Copy **iOS URL Scheme** (the reversed client ID) → goes in `app.json`

**Android client**:
1. Create another OAuth 2.0 Client ID
2. Application type: **Android**
3. Package name: `com.tribelife.app`
4. SHA-1 fingerprint: run `eas credentials` to get this, or for development use:
   ```bash
   keytool -keystore ~/.android/debug.keystore -list -v -alias androiddebugkey -storepass android -keypass android
   ```
5. Copy **Client ID** → goes in `.env` as `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

---

## Step 2 — RevenueCat Setup

1. Create an account at [revenuecat.com](https://revenuecat.com)
2. Create a new project: **TribeLife**
3. Add platforms: iOS + Android
4. Copy your **API keys** → goes in `tribelife-mobile/.env`
5. Create a Product in App Store Connect / Google Play:
   - Product ID: `tribelife_premium_monthly`
   - Price: $4.99/month
6. In RevenueCat dashboard → **Entitlements** → Create entitlement named `premium`
7. Link the product to the `premium` entitlement

---

## Step 3 — Backend Setup (DigitalOcean)

### 3.1 Create a Droplet
- Ubuntu 22.04 LTS, Basic plan ($12/month recommended)
- Add your SSH key

### 3.2 Install dependencies on the droplet
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
```

### 3.3 Deploy the backend
```bash
# On your local machine
cd tribelife-backend
npm install
cp .env.example .env
# Fill in all values in .env

# Push schema to database
npm run db:push

# Build
npm run build

# Upload to droplet (or use GitHub Actions / rsync)
rsync -avz dist/ user@your-droplet-ip:~/tribelife-backend/dist/
rsync -avz package.json .env user@your-droplet-ip:~/tribelife-backend/

# On the droplet
cd ~/tribelife-backend
npm install --production
pm2 start dist/server.js --name tribelife-backend
pm2 save
pm2 startup
```

### 3.4 Set up Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Then: `sudo certbot --nginx -d api.yourdomain.com` for HTTPS.

---

## Step 4 — Mobile App Setup

```bash
cd tribelife-mobile
npm install
cp .env.example .env
# Fill in your values
```

### 4.1 Update app.json
- Replace `your-eas-project-id` with your EAS project ID (run `eas build:configure`)
- Replace `$(GOOGLE_REVERSED_CLIENT_ID)` with your actual iOS reversed client ID

### 4.2 Run locally
```bash
# Start development server
npx expo start

# iOS simulator
npx expo start --ios

# Android emulator
npx expo start --android
```

### 4.3 Build for stores
```bash
# Configure EAS
eas build:configure

# Build iOS
eas build --platform ios

# Build Android
eas build --platform android
```

---

## Environment Variables Summary

### tribelife-backend/.env
```
DATABASE_URL=postgresql://...
JWT_SECRET=<32+ random chars>
JWT_EXPIRES_IN=30d
GOOGLE_CLIENT_ID=<web client id from step 1.4>
GOOGLE_CLIENT_SECRET=<web client secret>
ANTHROPIC_API_KEY=sk-ant-...
PORT=4000
NODE_ENV=production
```

### tribelife-mobile/.env
```
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<web client id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<android client id>
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```
