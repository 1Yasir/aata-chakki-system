# Aata Chakki Daily Management

Production-style Vite + React app with a public mill landing page and a Firebase-backed admin dashboard for daily pisai, peen, stock, electricity, and udhaar.

## Stack

- React 19, Vite 8, React Router
- Tailwind CSS v4
- Lucide icons
- Firebase Auth (email/password) + Firestore

## Setup

1. Copy environment variables:

```bash
copy .env.example .env
```

2. Fill Firebase web config values:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

3. In Firebase Console:

- Enable **Authentication → Email/Password** and create the mill admin user.
- Create Firestore in production mode, then publish rules similar to `firestore.rules`.
- Collections used: `daily_entries` (documents) and `settings/main` (single settings document).

4. Install and run:

```bash
npm install
npm run dev
```

## Routes

| Path | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page: hero, services, rates, hours, contact |
| `/login` | Public | Firebase email/password login |
| `/admin` | Auth only | Daily entry CRUD, live KPIs, settings, history |

Unauthenticated visits to `/admin` redirect to `/login`.

## Calculation engine

- `totalMaundsGround = custMaunds + ownMaundsGround`
- `totalUnits = totalMaundsGround * unitsPerMaund`
- `electricityCost = totalUnits * ratePerUnit`
- `kardaSaved = custMaunds * kardaRate`
- `grossIncome = (custMaunds * pisaiRate) + (peenMaunds * peenRate) + (ownMaundsGround * ownProfitPerMaund)`
- `netProfit = grossIncome - (electricityCost + otherExpenses)`
- `remainingWheatStock = totalWheatStock - cumulative ownMaundsGround`
- `totalUdhaarBalance = initialUdhaar + cumulative udhaarGiven - cumulative udhaarRecovered`

Live KPIs include the form values you are currently typing. Editing an existing row replaces that row in the cumulative math instead of double-counting it.

## Firestore document (`daily_entries`)

`date`, `custMaunds`, `kardaRate`, `peenMaunds`, `ownMaundsGround`, `ownProfitPerMaund`, `udhaarGiven`, `udhaarRecovered`, `otherExpenses`, `totalUnits`, `kardaSaved`, `electricityCost`, `grossIncome`, `netProfit`, `createdAt`.
