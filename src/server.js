const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const PORT = process.env.PORT || 10000;


// ======================================================
// EPAYYATRA CONFIG
// ======================================================

const EPAY_USERNAME = process.env.EPAY_USERNAME;
const EPAY_API_TOKEN = process.env.EPAY_API_TOKEN;
const EPAY_PIN = process.env.EPAY_PIN;


// ======================================================
// RAZORPAY CONFIG
// ======================================================

const RAZORPAY_KEY_ID =
    process.env.RAZORPAY_KEY_ID;

const RAZORPAY_KEY_SECRET =
    process.env.RAZORPAY_KEY_SECRET;


// ======================================================
// TEMPORARY WALLET STORAGE
// ======================================================
//
// IMPORTANT:
// यह अभी testing के लिए है।
// Render restart होने पर data reset हो सकता है।
//
// बाद में Firebase Firestore जोड़ेंगे।
// ======================================================

const wallets = new Map();


// ======================================================
// PAYMENT / ORDER STORAGE
// ======================================================

const walletOrders = new Map();


// ======================================================
// HEALTH / BASIC
// ======================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "AJ Seva Recharge Backend is running",

        status:
            "online"

    });

});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        backend:
            "online",

        epay_configured:
            !!EPAY_USERNAME &&
            !!EPAY_API_TOKEN &&
            !!EPAY_PIN,

        razorpay_configured:
            !!RAZORPAY_KEY_ID &&
            !!RAZORPAY_KEY_SECRET

    });

});


// ======================================================
// RAZORPAY AUTH HEADER
// ======================================================

function razorpayAuthHeader() {

    const token =
        `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`;

    return "Basic " +
        Buffer
            .from(token)
            .toString("base64");
}


// ======================================================
// CREATE RAZORPAY ORDER
// ======================================================
//
// POST /api/wallet/create-order
//
// Body:
//
// {
//     "amount": 100,
//     "userId": "customer123"
// }
//
// ======================================================

app.post(
    "/api/wallet/create-order",
    async (req, res) => {

        try {

            const {
                amount,
                userId
            } = req.body;


            // ----------------------------------------------
            // VALIDATION
            // ----------------------------------------------

            const numericAmount =
                Number(amount);


            if (
                !Number.isFinite(numericAmount) ||
                numericAmount < 10
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Minimum wallet amount is ₹10"

                });

            }


            if (!RAZORPAY_KEY_ID ||
                !RAZORPAY_KEY_SECRET) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Razorpay is not configured on server"

                });

            }


            // ----------------------------------------------
            // AMOUNT IN PAISE
            // ----------------------------------------------

            const amountInPaise =
                Math.round(
                    numericAmount * 100
                );


            // ----------------------------------------------
            // UNIQUE RECEIPT
            // ----------------------------------------------

            const receipt =
                "AJWALLET" +
                Date.now();


            // ----------------------------------------------
            // RAZORPAY ORDER DATA
            // ----------------------------------------------

            const orderData = {

                amount:
                    amountInPaise,

                currency:
                    "INR",

                receipt:
                    receipt,

                notes: {

                    userId:
                        String(userId || ""),

                    purpose:
                        "wallet_add_money",

                    walletAmount:
                        String(numericAmount)

                }

            };


            // ----------------------------------------------
            // CREATE RAZORPAY ORDER
            // ----------------------------------------------

            const response =
                await fetch(
                    "https://api.razorpay.com/v1/orders",
                    {

                        method:
                            "POST",

                        headers: {

                            "Authorization":
                                razorpayAuthHeader(),

                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json"

                        },

                        body:
                            JSON.stringify(
                                orderData
                            )

                    }
                );


            const data =
                await response.json();


            // ----------------------------------------------
            // RAZORPAY ERROR
            // ----------------------------------------------

            if (!response.ok) {

                console.error(
                    "Razorpay Order Error:",
                    data
                );

                return res.status(502).json({

                    success: false,

                    message:
                        data?.error?.description ||
                        "Unable to create Razorpay order",

                    provider_response:
                        data

                });

            }


            // ----------------------------------------------
            // SAVE ORDER
            // ----------------------------------------------

            walletOrders.set(
                data.id,
                {

                    orderId:
                        data.id,

                    userId:
                        String(userId || ""),

                    amount:
                        numericAmount,

                    amountInPaise:
                        amountInPaise,

                    status:
                        "created",

                    credited:
                        false,

                    createdAt:
                        Date.now()

                }
            );


            // ----------------------------------------------
            // SEND ORDER TO APP
            // ----------------------------------------------

            return res.json({

                success: true,

                order_id:
                    data.id,

                amount:
                    data.amount,

                amount_rupees:
                    numericAmount,

                currency:
                    data.currency,

                key_id:
                    RAZORPAY_KEY_ID,

                status:
                    data.status

            });

        } catch (error) {

            console.error(
                "Create Order Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Server error while creating order"

            });

        }

    }
);


// ======================================================
// VERIFY RAZORPAY PAYMENT
// ======================================================
//
// POST /api/wallet/verify-payment
//
// Body:
//
// {
//     "razorpay_order_id": "...",
//     "razorpay_payment_id": "...",
//     "razorpay_signature": "..."
// }
//
// ======================================================

app.post(
    "/api/wallet/verify-payment",
    async (req, res) => {

        try {

            const {

                razorpay_order_id,

                razorpay_payment_id,

                razorpay_signature

            } = req.body;


            // ----------------------------------------------
            // VALIDATION
            // ----------------------------------------------

            if (
                !razorpay_order_id ||
                !razorpay_payment_id ||
                !razorpay_signature
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment verification data is incomplete"

                });

            }


            // ----------------------------------------------
            // FIND SERVER ORDER
            // ----------------------------------------------

            const order =
                walletOrders.get(
                    razorpay_order_id
                );


            if (!order) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Order not found on server"

                });

            }


            // ----------------------------------------------
            // PREVENT DOUBLE CREDIT
            // ----------------------------------------------

            if (order.credited) {

                const currentBalance =
                    wallets.get(
                        order.userId
                    ) || 0;

                return res.json({

                    success: true,

                    already_processed:
                        true,

                    message:
                        "Payment already processed",

                    wallet_balance:
                        currentBalance

                });

            }


            // ----------------------------------------------
            // CREATE SIGNATURE
            // ----------------------------------------------

            const body =
                razorpay_order_id +
                "|" +
                razorpay_payment_id;


            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        RAZORPAY_KEY_SECRET
                    )
                    .update(body)
                    .digest("hex");


            // ----------------------------------------------
            // SAFE SIGNATURE COMPARE
            // ----------------------------------------------

            const receivedBuffer =
                Buffer.from(
                    razorpay_signature,
                    "utf8"
                );

            const expectedBuffer =
                Buffer.from(
                    expectedSignature,
                    "utf8"
                );


            const signatureValid =
                receivedBuffer.length ===
                    expectedBuffer.length &&
                crypto.timingSafeEqual(
                    receivedBuffer,
                    expectedBuffer
                );


            if (!signatureValid) {

                console.error(
                    "Invalid Razorpay Signature"
                );

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment signature"

                });

            }


            // ----------------------------------------------
            // FETCH PAYMENT FROM RAZORPAY
            // ----------------------------------------------

            const paymentResponse =
                await fetch(
                    "https://api.razorpay.com/v1/payments/" +
                    encodeURIComponent(
                        razorpay_payment_id
                    ),
                    {

                        method:
                            "GET",

                        headers: {

                            "Authorization":
                                razorpayAuthHeader(),

                            "Accept":
                                "application/json"

                        }

                    }
                );


            const paymentData =
                await paymentResponse.json();


            if (!paymentResponse.ok) {

                console.error(
                    "Payment Fetch Error:",
                    paymentData
                );

                return res.status(502).json({

                    success: false,

                    message:
                        "Unable to verify payment with Razorpay",

                    provider_response:
                        paymentData

                });

            }


            // ----------------------------------------------
            // CHECK ORDER ID
            // ----------------------------------------------

            if (
                paymentData.order_id !==
                razorpay_order_id
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment order mismatch"

                });

            }


            // ----------------------------------------------
            // CHECK AMOUNT
            // ----------------------------------------------

            if (
                Number(paymentData.amount) !==
                Number(order.amountInPaise)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount mismatch"

                });

            }


            // ----------------------------------------------
            // CHECK PAYMENT STATUS
            // ----------------------------------------------

            const paymentStatus =
                String(
                    paymentData.status || ""
                ).toLowerCase();


            if (
                paymentStatus !==
                "captured"
            ) {

                return res.status(400).json({

                    success: false,

                    payment_status:
                        paymentStatus,

                    message:
                        "Payment is not captured yet"

                });

            }


            // ----------------------------------------------
            // CREDIT WALLET
            // ----------------------------------------------

            const oldBalance =
                wallets.get(
                    order.userId
                ) || 0;


            const newBalance =
                Number(
                    (
                        oldBalance +
                        order.amount
                    ).toFixed(2)
                );


            wallets.set(
                order.userId,
                newBalance
            );


            // ----------------------------------------------
            // MARK ORDER AS CREDITED
            // ----------------------------------------------

            order.credited =
                true;

            order.status =
                "paid";

            order.paymentId =
                razorpay_payment_id;

            order.verifiedAt =
                Date.now();


            walletOrders.set(
                razorpay_order_id,
                order
            );


            // ----------------------------------------------
            // SUCCESS
            // ----------------------------------------------

            return res.json({

                success: true,

                message:
                    "Payment verified and wallet credited",

                payment_id:
                    razorpay_payment_id,

                order_id:
                    razorpay_order_id,

                amount:
                    order.amount,

                wallet_balance:
                    newBalance

            });

        } catch (error) {

            console.error(
                "Payment Verification Error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Payment verification failed"

            });

        }

    }
);


// ======================================================
// WALLET BALANCE
// ======================================================
//
// GET /api/wallet/balance?userId=xxxxx
//
// ======================================================

app.get(
    "/api/wallet/balance",
    (req, res) => {

        try {

            const userId =
                String(
                    req.query.userId || ""
                );


            if (!userId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "userId is required"

                });

            }


            const balance =
                wallets.get(
                    userId
                ) || 0;


            return res.json({

                success: true,

                userId:
                    userId,

                balance:
                    Number(
                        balance.toFixed(2)
                    )

            });

        } catch (error) {

            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// ======================================================
// WALLET TEST BALANCE
// ======================================================
//
// केवल testing के लिए
//
// POST /api/wallet/set-test-balance
//
// Body:
//
// {
//     "userId": "test123",
//     "amount": 500
// }
//
// बाद में इसे हटा देंगे।
// ======================================================

app.post(
    "/api/wallet/set-test-balance",
    (req, res) => {

        const {
            userId,
            amount
        } = req.body;


        if (!userId) {

            return res.status(400).json({

                success: false,

                message:
                    "userId is required"

            });

        }


        const numericAmount =
            Number(amount);


        if (
            !Number.isFinite(
                numericAmount
            ) ||
            numericAmount < 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid amount"

            });

        }


        wallets.set(
            String(userId),
            Number(
                numericAmount.toFixed(2)
            )
        );


        return res.json({

            success: true,

            userId:
                String(userId),

            balance:
                numericAmount,

            message:
                "Test wallet balance updated"

        });

    }
);


// ======================================================
// RECHARGE API
// ======================================================

app.post(
    "/api/recharge",
    async (req, res) => {

        try {

            const {

                number,
                amount,
                operator,
                ref_id,
                field1,
                field2,
                field3,
                field4,
                field5

            } = req.body;


            // ----------------------------------------------
            // VALIDATION
            // ----------------------------------------------

            if (!number) {

                return res.status(400).json({

                    success: false,

                    status: "Error",

                    message:
                        "Mobile number is required"

                });

            }


            if (!amount) {

                return res.status(400).json({

                    success: false,

                    status: "Error",

                    message:
                        "Recharge amount is required"

                });

            }


            if (!operator) {

                return res.status(400).json({

                    success: false,

                    status: "Error",

                    message:
                        "Operator code is required"

                });

            }


            if (
                !EPAY_USERNAME ||
                !EPAY_API_TOKEN ||
                !EPAY_PIN
            ) {

                return res.status(500).json({

                    success: false,

                    status: "Error",

                    message:
                        "Recharge API is not configured on server"

                });

            }


            // ----------------------------------------------
            // UNIQUE REFERENCE ID
            // ----------------------------------------------

            const referenceId =
                ref_id ||
                `AJSEVA${Date.now()}`;


            // ----------------------------------------------
            // EPAYYATRA API
            // ----------------------------------------------

            const apiUrl =
                "https://www.epayyatra.com/webservices/api/recharge";


            // ----------------------------------------------
            // PARAMETERS
            // ----------------------------------------------

            const params =
                new URLSearchParams();


            params.append(
                "username",
                EPAY_USERNAME
            );


            params.append(
                "api_token",
                EPAY_API_TOKEN
            );


            params.append(
                "number",
                String(number)
            );


            params.append(
                "amount",
                String(amount)
            );


            params.append(
                "operator",
                String(operator)
            );


            params.append(
                "ref_id",
                referenceId
            );


            if (field1)
                params.append(
                    "field1",
                    String(field1)
                );


            if (field2)
                params.append(
                    "field2",
                    String(field2)
                );


            if (field3)
                params.append(
                    "field3",
                    String(field3)
                );


            if (field4)
                params.append(
                    "field4",
                    String(field4)
                );


            if (field5)
                params.append(
                    "field5",
                    String(field5)
                );


            params.append(
                "pin",
                EPAY_PIN
            );


            // ----------------------------------------------
            // CALL EPAYYATRA
            // ----------------------------------------------

            const response =
                await fetch(
                    `${apiUrl}?${params.toString()}`,
                    {

                        method:
                            "GET",

                        headers: {

                            "Accept":
                                "application/json"

                        }

                    }
                );


            const text =
                await response.text();


            // ----------------------------------------------
            // PARSE RESPONSE
            // ----------------------------------------------

            let data;


            try {

                data =
                    JSON.parse(text);

            } catch {

                data = {

                    raw_response:
                        text

                };

            }


            // ----------------------------------------------
            // RETURN
            // ----------------------------------------------

            return res.status(
                response.ok
                    ? 200
                    : 502
            ).json({

                success:
                    response.ok,

                status:
                    data.status ||
                    "Unknown",

                number:
                    data.number ||
                    number,

                amount:
                    data.amount ||
                    amount,

                operator:
                    data.operator ||
                    operator,

                ref_id:
                    data.ref_id ||
                    referenceId,

                txn_id:
                    data.txn_id ||
                    "",

                opt_id:
                    data.opt_id ||
                    "",

                balance:
                    data.balance ||
                    "",

                message:
                    data.message ||
                    "Recharge response received",

                provider_response:
                    data

            });

        } catch (error) {

            console.error(
                "Recharge Error:",
                error
            );

            return res.status(500).json({

                success: false,

                status:
                    "Error",

                message:
                    error.message ||
                    "Recharge server error"

            });

        }

    }
);


// ======================================================
// EPAYYATRA CALLBACK
// ======================================================

app.all(
    "/api/recharge/callback",
    (req, res) => {

        console.log(
            "EPAYYATRA CALLBACK:",
            req.body || req.query
        );


        res.json({

            success: true,

            message:
                "Callback received"

        });

    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `AJ Seva Recharge Backend running on port ${PORT}`
        );

    }
);
