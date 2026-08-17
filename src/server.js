const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const PORT = process.env.PORT || 10000;

const EPAY_USERNAME = process.env.EPAY_USERNAME;
const EPAY_API_TOKEN = process.env.EPAY_API_TOKEN;
const EPAY_PIN = process.env.EPAY_PIN;


// ======================================================
// BASIC HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "AJ Seva Recharge Backend is running",
        status: "online"
    });
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {

    res.json({
        success: true,
        backend: "online",
        epay_configured:
            !!EPAY_USERNAME &&
            !!EPAY_API_TOKEN &&
            !!EPAY_PIN
    });

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


        // ----------------------------------------------
        // VALIDATION
        // ----------------------------------------------

        if (!number) {

            return res.status(400).json({
                success: false,
                status: "Error",
                message: "Mobile number is required"
            });

        }


        if (!amount) {

            return res.status(400).json({
                success: false,
                status: "Error",
                message: "Recharge amount is required"
            });

        }


        if (!operator) {

            return res.status(400).json({
                success: false,
                status: "Error",
                message: "Operator code is required"
            });

        }


        if (!EPAY_USERNAME || !EPAY_API_TOKEN || !EPAY_PIN) {

            return res.status(500).json({
                success: false,
                status: "Error",
                message: "Recharge API is not configured on server"
            });

        }


        // ----------------------------------------------
        // UNIQUE REFERENCE ID
        // ----------------------------------------------

        const referenceId =
            ref_id ||
            `AJSEVA${Date.now()}`;


        // ----------------------------------------------
        // EPAYYATRA API URL
        // ----------------------------------------------

        const apiUrl =
            "https://www.epayyatra.com/webservices/api/recharge";


        // ----------------------------------------------
        // REQUEST PARAMETERS
        // ----------------------------------------------

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


        // Optional fields
        if (field1)
            params.append("field1", String(field1));

        if (field2)
            params.append("field2", String(field2));

        if (field3)
            params.append("field3", String(field3));

        if (field4)
            params.append("field4", String(field4));

        if (field5)
            params.append("field5", String(field5));


        // PIN
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
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );


        const text =
            await response.text();


        // ----------------------------------------------
        // TRY JSON RESPONSE
        // ----------------------------------------------

        let data;

        try {

            data = JSON.parse(text);

        } catch {

            data = {
                raw_response: text
            };

        }


        // ----------------------------------------------
        // RETURN RESPONSE TO APP
        // ----------------------------------------------

        return res.status(
            response.ok ? 200 : 502
        ).json({

            success: response.ok,

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

            status: "Error",

            message:
                error.message ||
                "Recharge server error"

        });

    }

});


// ======================================================
// CALLBACK / RESPONSE ENDPOINT
// ======================================================

app.all("/api/recharge/callback", (req, res) => {

    console.log(
        "EPAYYATRA CALLBACK:",
        req.body || req.query
    );


    res.json({
        success: true,
        message: "Callback received"
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

    }
);
