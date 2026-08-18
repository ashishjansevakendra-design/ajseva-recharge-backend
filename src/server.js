const express = require("express");
const cors = require("cors");

const app = express();

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ======================================================
// PORT
// ======================================================

const PORT = process.env.PORT || 10000;


// ======================================================
// EPAYYATRA CONFIGURATION
// ======================================================

const EPAY_USERNAME = process.env.EPAY_USERNAME;
const EPAY_API_TOKEN = process.env.EPAY_API_TOKEN;


// ======================================================
// EPAYYATRA API URLS
// ======================================================

const EPAY_RECHARGE_URL =
    "https://www.epayyatra.com/webservices/api/recharge";

const EPAY_BALANCE_URL =
    "https://www.epayyatra.com/webservices/api/balance";

const EPAY_STATUS_URL =
    "https://www.epayyatra.com/webservices/api/statusByRefId";

const EPAY_COMPLAIN_URL =
    "https://www.epayyatra.com/webservices/api/complain";


// ======================================================
// HELPER: CHECK CONFIGURATION
// ======================================================

function isEpayConfigured() {
    return !!(
        EPAY_USERNAME &&
        EPAY_API_TOKEN
    );
}


// ======================================================
// HELPER: SAFE JSON RESPONSE
// ======================================================

async function readProviderResponse(response) {

    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            raw_response: text
        };
    }
}


// ======================================================
// HELPER: STATUS SUCCESS
// ======================================================

function isRechargeSuccess(status) {

    const value = String(status || "").toLowerCase();

    return [
        "pending",
        "accepted",
        "success"
    ].includes(value);
}


// ======================================================
// BASIC HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "AJ Seva Recharge Backend is running",
        status: "online",
        service: "ePayYatra Recharge API"
    });

});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        backend: "online",

        epay_configured: isEpayConfigured(),

        username_configured: !!EPAY_USERNAME,

        api_token_configured: !!EPAY_API_TOKEN

    });

});


// ======================================================
// BALANCE API
// ======================================================

app.get("/api/balance", async (req, res) => {

    try {

        if (!isEpayConfigured()) {

            return res.status(500).json({

                success: false,

                status: "Error",

                message:
                    "ePayYatra API is not configured on server"

            });

        }


        const params = new URLSearchParams();

        params.append(
            "username",
            EPAY_USERNAME
        );

        params.append(
            "api_token",
            EPAY_API_TOKEN
        );


        const response = await fetch(
            `${EPAY_BALANCE_URL}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );


        const data =
            await readProviderResponse(response);


        const providerStatus =
            String(data.status || "");


        const balanceSuccess =
            providerStatus.toLowerCase() === "ok" ||
            providerStatus.toLowerCase() === "success";


        return res.status(
            response.ok ? 200 : 502
        ).json({

            success: balanceSuccess,

            status: providerStatus,

            totalBalance:
                data.totalBalance || "0.00",

            mainBalance:
                data.mainBalance ||
                data.rechargeBalance ||
                "0.00",

            rechargeBalance:
                data.rechargeBalance || "0.00",

            utilityBalance:
                data.utilityBalance || "0.00",

            aepsBalance:
                data.aepsBalance || "0.00",

            message:
                data.message ||
                "Balance response received",

            provider_response:
                data

        });

    } catch (error) {

        console.error(
            "Balance API Error:",
            error
        );

        return res.status(500).json({

            success: false,

            status: "Error",

            message:
                error.message ||
                "Balance server error"

        });

    }

});


// ======================================================
// RECHARGE API
// ======================================================

app.post("/api/recharge", async (req, res) => {

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


        // ------------------------------------------------
        // VALIDATION
        // ------------------------------------------------

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


        if (!isEpayConfigured()) {

            return res.status(500).json({

                success: false,

                status: "Error",

                message:
                    "ePayYatra API is not configured on server"

            });

        }


        // ------------------------------------------------
        // UNIQUE REFERENCE ID
        // ------------------------------------------------

        const referenceId =
            ref_id ||
            `AJSEVA${Date.now()}`;


        // ------------------------------------------------
        // REQUEST PARAMETERS
        // ------------------------------------------------

        const params = new URLSearchParams();


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


        // ------------------------------------------------
        // OPTIONAL BILL PAYMENT FIELDS
        // ------------------------------------------------

        if (field1 !== undefined && field1 !== null) {

            params.append(
                "field1",
                String(field1)
            );

        }


        if (field2 !== undefined && field2 !== null) {

            params.append(
                "field2",
                String(field2)
            );

        }


        if (field3 !== undefined && field3 !== null) {

            params.append(
                "field3",
                String(field3)
            );

        }


        if (field4 !== undefined && field4 !== null) {

            params.append(
                "field4",
                String(field4)
            );

        }


        if (field5 !== undefined && field5 !== null) {

            params.append(
                "field5",
                String(field5)
            );

        }


        // ------------------------------------------------
        // CALL EPAYYATRA
        // ------------------------------------------------

        console.log(
            "Recharge request:",
            {
                number,
                amount,
                operator,
                ref_id: referenceId
            }
        );


        const response = await fetch(
            `${EPAY_RECHARGE_URL}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );


        const data =
            await readProviderResponse(response);


        console.log(
            "ePayYatra response:",
            data
        );


        const providerStatus =
            String(data.status || "Unknown");


        // ------------------------------------------------
        // RESPONSE
        // ------------------------------------------------

        return res.status(
            response.ok ? 200 : 502
        ).json({

            success:
                response.ok &&
                isRechargeSuccess(providerStatus),

            status:
                providerStatus,

            number:
                data.number ||
                String(number),

            amount:
                data.amount ||
                String(amount),

            operator:
                data.operator ||
                String(operator),

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
            "Recharge API Error:",
            error
        );

        return res.status(500).json({

            success: false,

            status: "Error",

            message:
                error.message ||
                "Recharge server error"

        });

    }

});


// ======================================================
// STATUS CHECK API
// ======================================================

app.get("/api/recharge/status", async (req, res) => {

    try {

        const {
            ref_id,
            recharge_date
        } = req.query;


        if (!ref_id) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "ref_id is required"

            });

        }


        if (!isEpayConfigured()) {

            return res.status(500).json({

                success: false,

                status: "Error",

                message:
                    "ePayYatra API is not configured on server"

            });

        }


        // ------------------------------------------------
        // DATE
        // ------------------------------------------------

        const today =
            new Date()
                .toISOString()
                .slice(0, 10);


        const rechargeDate =
            recharge_date || today;


        // ------------------------------------------------
        // PARAMETERS
        // ------------------------------------------------

        const params = new URLSearchParams();


        params.append(
            "username",
            EPAY_USERNAME
        );


        params.append(
            "api_token",
            EPAY_API_TOKEN
        );


        params.append(
            "ref_id",
            String(ref_id)
        );


        params.append(
            "recharge_date",
            rechargeDate
        );


        // ------------------------------------------------
        // CALL EPAYYATRA
        // ------------------------------------------------

        const response = await fetch(
            `${EPAY_STATUS_URL}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );


        const data =
            await readProviderResponse(response);


        const providerStatus =
            String(data.status || "Unknown");


        return res.status(
            response.ok ? 200 : 502
        ).json({

            success:
                response.ok &&
                providerStatus.toLowerCase() !== "error",

            status:
                providerStatus,

            number:
                data.number || "",

            amount:
                data.amount || "",

            operator:
                data.operator || "",

            ref_id:
                data.ref_id ||
                String(ref_id),

            txn_id:
                data.txn_id || "",

            opt_id:
                data.opt_id || "",

            balance:
                data.balance || "",

            message:
                data.message ||
                "Status response received",

            provider_response:
                data

        });

    } catch (error) {

        console.error(
            "Status API Error:",
            error
        );

        return res.status(500).json({

            success: false,

            status: "Error",

            message:
                error.message ||
                "Status check server error"

        });

    }

});


// ======================================================
// COMPLAIN / DISPUTE API
// ======================================================

app.post("/api/recharge/complain", async (req, res) => {

    try {

        const {
            txn_id,
            reason
        } = req.body;


        if (!txn_id) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "txn_id is required"

            });

        }


        if (!reason) {

            return res.status(400).json({

                success: false,

                status: "Error",

                message:
                    "Complaint reason is required"

            });

        }


        if (!isEpayConfigured()) {

            return res.status(500).json({

                success: false,

                status: "Error",

                message:
                    "ePayYatra API is not configured on server"

            });

        }


        const params = new URLSearchParams();


        params.append(
            "username",
            EPAY_USERNAME
        );


        params.append(
            "api_token",
            EPAY_API_TOKEN
        );


        params.append(
            "txn_id",
            String(txn_id)
        );


        params.append(
            "reason",
            String(reason)
        );


        const response = await fetch(
            `${EPAY_COMPLAIN_URL}?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );


        const data =
            await readProviderResponse(response);


        const providerStatus =
            String(data.status || "Unknown");


        return res.status(
            response.ok ? 200 : 502
        ).json({

            success:
                response.ok &&
                providerStatus.toLowerCase() === "accepted",

            status:
                providerStatus,

            complain_id:
                data.complain_id || "",

            message:
                data.message ||
                "Complaint response received",

            provider_response:
                data

        });

    } catch (error) {

        console.error(
            "Complaint API Error:",
            error
        );

        return res.status(500).json({

            success: false,

            status: "Error",

            message:
                error.message ||
                "Complaint server error"

        });

    }

});


// ======================================================
// RECHARGE CALLBACK
// ======================================================

app.all("/api/recharge/callback", (req, res) => {

    try {

        const data = {

            number:
                req.query.number ||
                req.body?.number ||
                "",

            amount:
                req.query.amount ||
                req.body?.amount ||
                "",

            txnId:
                req.query.txnId ||
                req.body?.txnId ||
                "",

            refId:
                req.query.refId ||
                req.body?.refId ||
                "",

            status:
                req.query.status ||
                req.body?.status ||
                "",

            operatorId:
                req.query.operatorId ||
                req.body?.operatorId ||
                "",

            operatorCode:
                req.query.operatorCode ||
                req.body?.operatorCode ||
                "",

            balance:
                req.query.balance ||
                req.body?.balance ||
                ""

        };


        console.log(
            "================================================"
        );

        console.log(
            "EPAYYATRA CALLBACK RECEIVED"
        );

        console.log(
            data
        );

        console.log(
            "================================================"
        );


        return res.json({

            success: true,

            message:
                "Callback received",

            data

        });

    } catch (error) {

        console.error(
            "Callback Error:",
            error
        );

        return res.status(500).json({

            success: false,

            status: "Error",

            message:
                "Callback processing error"

        });

    }

});


// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {

    res.status(404).json({

        success: false,

        status: "NotFound",

        message:
            "API endpoint not found",

        path:
            req.originalUrl

    });

});


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {

    console.error(
        "Global Error:",
        error
    );


    res.status(500).json({

        success: false,

        status: "Error",

        message:
            error.message ||
            "Internal server error"

    });

});


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

        console.log(
            `ePayYatra configured: ${isEpayConfigured()}`
        );

    }
);
