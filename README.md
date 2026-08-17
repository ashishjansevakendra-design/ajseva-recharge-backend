# AJ Seva Recharge Backend

This backend keeps ePayYatra credentials off the Android APK and provides:
- Recharge
- Status check
- Callback
- Balance
- Complaint
- Operator list
- Firestore order updates

## Setup

1. `npm install`
2. Copy `.env.example` to `.env`
3. Set `EPAYYATRA_USERNAME` and `EPAYYATRA_API_TOKEN`
4. Configure Firebase Admin using `GOOGLE_APPLICATION_CREDENTIALS`
5. Set a long random `APP_API_KEY`
6. Deploy on a server/VPS with a stable public IP.

Callback URL for ePayYatra:
`https://YOUR-DOMAIN/api/epayyatra/callback`

Do not put the ePayYatra token, PIN, or password in the Android app.
Do not upload the Firebase service-account JSON to GitHub.

## App endpoints

`GET /health`

`GET /api/operators` with header `X-App-Key`

`POST /api/recharge` with JSON:
{
  "number":"9999999999",
  "amount":10,
  "operator":"Jio",
  "type":"mobile"
}

`GET /api/status/AJSEVA-...` with `X-App-Key`

`GET /api/balance` with `X-App-Key`

`POST /api/complain` with:
{"txnId":"EPAY_TXN_ID","reason":"Recharge failed but amount was debited"}

## Firestore

Recharge orders are stored in:
`orders/{refId}`

## Operator codes from the supplied ePayYatra document

Mobile: Airtel AT, Airtel GST ATG, Airtel WB AP, BSNL BT, BSNL GST BTG,
Jio JIO, Jio GST 143, J_SC JSP, Vi VI, VI GST VIG.

DTH: Airtel DTH ATDTH, Airtel DTH GST ADG, Dish TV DISHTV,
Dish TV GST DTG, Sun Direct SUNDTH, Sun Direct GST SDG,
Tata Sky TATASKY, Tata Sky GST TSG, Videocon D2H VDDTH, Videocon D2H GST VDG.

Postpaid: Airtel Postpaid PA, BSNL Postpaid PB, JIO Postpaid PJIO, VI Postpaid PV.
