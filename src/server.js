const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// ======================================================
// EPAYYATRA
// ======================================================

const EPAY_USERNAME = process.env.EPAY_USERNAME;
const EPAY_API_TOKEN = process.env.EPAY_API_TOKEN;
const EPAY_PIN = process.env.EPAY_PIN;

// ======================================================
// RAZORPAY
// ======================================================

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ======================================================
// TEMPORARY WALLET STORAGE
// IMPORTANT:
// Later we will move this to Firebase/Firestore.
// ======================================================

const wallets = new Map();
const walletTransactions = new Map();
const paymentOrders = new Map();

// ======================================================
// HELPER
// ======================================================

function getUserKey(req) {
    const userId =
        req.body?.userId ||
        req.query?.userId;

    if (!userId) return null;

    return String(userId);
}

function getWallet(userId) {

    if (!wallets.has(userId)) {
        wallets.set(userId, 0);
    }

    return Number(wallets.get(userId));
}

function setWallet(userId, amount) {
    wallets.set(
        userId,
        Number(Number(amount).toFixed(2))
    );
}

// ======================================================
// BASIC HEALTH
// ======================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "AJ Seva Recharge Backend is running",
        status: "online"
    });

});

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        backend: "online",

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
// WALLET BALANCE
// ======================================================

app.get("/api/wallet/balance", (req, res) => {

    try {

        const userId =
            getUserKey(req);

        if (!userId) {

            return res.status(400).json({
                success: false,
                message: "userId is required"
            });

        }

        const balance =
            getWallet(userId);

        return res.json({

            success: true,

            userId,

            balance: balance.toFixed(2)

        });

    } catch (error) {

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

});

// ======================================================
// WALLET TRANSACTIONS
// ======================================================

app.get("/api/wallet/transactions", (req, res) => {

    try {

        const userId =
            getUserKey(req);

        if (!userId) {

            return res.status(400).json({
                success: false,
                message: "userId is required"
            });

        }

        const transactions =
            walletTransactions.get(userId) || [];

        return res.json({

            success: true,

            transactions

        });

    } catch (error) {

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

});

// ======================================================
// CREATE RAZORPAY ORDER
// ======================================================

app.post("/api/wallet/create-order", async (req, res) => {

    try {

        const {
            userId,
            amount
        } = req.body;

        if (!userId) {

            return res.status(400).json({
                success: false,
                message: "userId is required"
            });

        }

        const numericAmount =
            Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount < 10 ||
            numericAmount > 100000
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Amount must be between ₹10 and ₹100000"

            });

        }

        if (
            !RAZORPAY_KEY_ID ||
            !RAZORPAY_KEY_SECRET
        ) {

            return res.status(500).json({

                success: false,

                message:
                    "Razorpay is not configured on server"

            });

        }

        const receipt =
            `AJSEVA_${Date.now()}`;

        const amountInPaise =
            Math.round(
                numericAmount * 100
            );

        const auth =
            Buffer
                .from(
                    `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
                )
                .toString("base64");

        const response =
            await fetch(
                "https://api.razorpay.com/v1/orders",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Basic ${auth}`

                    },

                    body:
                        JSON.stringify({

                            amount:
                                amountInPaise,

                            currency:
                                "INR",

                            receipt,

                            notes: {
                                userId:
                                    String(userId)
                            }

                        })

                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            return res.status(502).json({

                success: false,

                message:
                    data?.error?.description ||
                    "Unable to create Razorpay order",

                provider_response:
                    data

            });

        }

        paymentOrders.set(
            data.id,
            {
                userId:
                    String(userId),

                amount:
                    numericAmount,

                status:
                    "created"
            }
        );

        return res.json({

            success: true,

            keyId:
                RAZORPAY_KEY_ID,

            orderId:
                data.id,

            amount:
                amountInPaise,

            amountRupees:
                numericAmount,

            currency:
                "INR"

        });

    } catch (error) {

        console.error(
            "Create order error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message

        });

    }

});

// ======================================================
// VERIFY RAZORPAY PAYMENT
// ======================================================

app.post("/api/wallet/verify-payment", async (req, res) => {

    try {

        const {
            userId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !userId ||
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

        const order =
            paymentOrders.get(
                razorpay_order_id
            );

        if (!order) {

            return res.status(400).json({

                success: false,

                message:
                    "Razorpay order not found"

            });

        }

        if (
            order.userId !==
            String(userId)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "User does not match order"

            });

        }

        const generatedSignature =
            crypto
                .createHmac(
                    "sha256",
                    RAZORPAY_KEY_SECRET
                )
                .update(
                    `${razorpay_order_id}|${razorpay_payment_id}`
                )
                .digest("hex");

        const valid =
            crypto.timingSafeEqual(
                Buffer.from(
                    generatedSignature,
                    "utf8"
                ),
                Buffer.from(
                    razorpay_signature,
                    "utf8"
                )
            );

        if (!valid) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid payment signature"

            });

        }

        // Prevent duplicate credit
        if (
            order.status ===
            "credited"
        ) {

            return res.json({

                success: true,

                message:
                    "Payment already credited",

                balance:
                    getWallet(userId)
                        .toFixed(2)

            });

        }

        const oldBalance =
            getWallet(userId);

        const newBalance =
            oldBalance +
            Number(order.amount);

        setWallet(
            userId,
            newBalance
        );

        order.status =
            "credited";

        order.paymentId =
            razorpay_payment_id;

        paymentOrders.set(
            razorpay_order_id,
            order
        );

        const transaction = {

            id:
                `WT${Date.now()}`,

            type:
                "CREDIT",

            amount:
                Number(order.amount)
                    .toFixed(2),

            paymentId:
                razorpay_payment_id,

            orderId:
                razorpay_order_id,

            status:
                "SUCCESS",

            createdAt:
                new Date().toISOString()

        };

        const list =
            walletTransactions.get(
                userId
            ) || [];

        list.unshift(
            transaction
        );

        walletTransactions.set(
            userId,
            list
        );

        return res.json({

            success: true,

            message:
                "Wallet credited successfully",

            credited:
                Number(order.amount)
                    .toFixed(2),

            balance:
                getWallet(userId)
                    .toFixed(2),

            transaction

        });

    } catch (error) {

        console.error(
            "Payment verification error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                error.message

        });

    }

});

// ======================================================
// RECHARGE
// ======================================================

app.post("/api/recharge", async (req, res) => {

    try {

        const {

            userId,

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

        if (!userId) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "userId is required"

            });

        }

        if (!number) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "Mobile number is required"

            });

        }

        const rechargeAmount =
            Number(amount);

        if (
            !Number.isFinite(
                rechargeAmount
            ) ||
            rechargeAmount <= 0
        ) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "Invalid recharge amount"

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
                    "Recharge API is not configured"

            });

        }

        // ----------------------------------------------
        // WALLET CHECK
        // ----------------------------------------------

        const walletBalance =
            getWallet(userId);

        if (
            walletBalance <
            rechargeAmount
        ) {

            return res.status(400).json({

                success: false,

                status:
                    "INSUFFICIENT_WALLET",

                message:
                    "Customer wallet balance is insufficient",

                walletBalance:
                    walletBalance.toFixed(2),

                required:
                    rechargeAmount.toFixed(2)

            });

        }

        // ----------------------------------------------
        // REFERENCE
        // ----------------------------------------------

        const referenceId =
            ref_id ||
            `AJSEVA${Date.now()}`;

        // ----------------------------------------------
        // EPAYYATRA
        // ----------------------------------------------

        const apiUrl =
            "https://www.epayyatra.com/webservices/api/recharge";

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
            String(rechargeAmount)
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

        const response =
            await fetch(
                `${apiUrl}?${params.toString()}`,
                {

                    method:
                        "GET",

                    headers: {

                        Accept:
                            "application/json"

                    }

                }
            );

        const text =
            await response.text();

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

        const providerStatus =
            String(
                data.status ||
                ""
            );

        const rechargeSuccess =
            response.ok &&
            (
                providerStatus
                    .toLowerCase()
                    === "success"
            );

        // ----------------------------------------------
        // SUCCESS → DEDUCT WALLET
        // ----------------------------------------------

        if (rechargeSuccess) {

            const currentBalance =
                getWallet(userId);

            const newBalance =
                currentBalance -
                rechargeAmount;

            setWallet(
                userId,
                newBalance
            );

            const transaction = {

                id:
                    `WT${Date.now()}`,

                type:
                    "DEBIT",

                amount:
                    rechargeAmount
                        .toFixed(2),

                mobile:
                    String(number),

                operator:
                    String(operator),

                refId:
                    referenceId,

                txnId:
                    data.txn_id ||
                    "",

                status:
                    "SUCCESS",

                createdAt:
                    new Date().toISOString()

            };

            const list =
                walletTransactions.get(
                    userId
                ) || [];

            list.unshift(
                transaction
            );

            walletTransactions.set(
                userId,
                list
            );

            return res.json({

                success: true,

                status:
                    "Success",

                message:
                    data.message ||
                    "Recharge successful",

                number:
                    number,

                amount:
                    rechargeAmount,

                operator:
                    operator,

                ref_id:
                    data.ref_id ||
                    referenceId,

                txn_id:
                    data.txn_id ||
                    "",

                balance:
                    getWallet(userId)
                        .toFixed(2),

                provider_response:
                    data

            });

        }

        // ----------------------------------------------
        // FAILED → NO WALLET DEDUCTION
        // ----------------------------------------------

        return res.status(400).json({

            success: false,

            status:
                providerStatus ||
                "Failed",

            message:
                data.message ||
                "Recharge failed. Wallet balance was not deducted.",

            balance:
                getWallet(userId)
                    .toFixed(2),

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
                "Recharge server error",

            note:
                "Wallet was not deducted."

        });

    }

});

// ======================================================
// EPAYYATRA CALLBACK
// ======================================================

app.all(
    "/api/recharge/callback",
    (req, res) => {

        console.log(
            "EPAYYATRA CALLBACK:",
            req.body ||
            req.query
        );

        res.json({

            success: true,

            message:
                "Callback received"

        });

    }
);

// ======================================================
// START
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
