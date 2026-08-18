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
// ENVIRONMENT
// ======================================================

const PORT = process.env.PORT || 10000;

const EPAY_USERNAME = process.env.EPAY_USERNAME;
const EPAY_API_TOKEN = process.env.EPAY_API_TOKEN;
const EPAY_PIN = process.env.EPAY_PIN;

const EPAY_BASE_URL =
    "https://www.epayyatra.com/webservices/api";

// ======================================================
// HELPER
// ======================================================

async function epayRequest(endpoint, parameters = {}) {

    const params = new URLSearchParams();

    params.append(
        "username",
        EPAY_USERNAME || ""
    );

    params.append(
        "api_token",
        EPAY_API_TOKEN || ""
    );

    Object.entries(parameters).forEach(
        ([key, value]) => {

            if (
                value !== undefined &&
                value !== null &&
                String(value).length > 0
            ) {
                params.append(
                    key,
                    String(value)
                );
            }

        }
    );

    const url =
        `${EPAY_BASE_URL}/${endpoint}?${params.toString()}`;

    const response =
        await fetch(
            url,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

    const text =
        await response.text();

    let data;

    try {

        data = JSON.parse(text);

    } catch {

        data = {
            raw_response: text
        };

    }

    return {
        httpStatus: response.status,
        ok: response.ok,
        data
    };
}

// ======================================================
// API CONFIG CHECK
// ======================================================

function isConfigured() {

    return (
        !!EPAY_USERNAME &&
        !!EPAY_API_TOKEN
    );
}

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "AJ Seva Recharge Backend is running",

        status:
            "online",

        version:
            "2.0.0"

    });

});

// ======================================================
// HEALTH
// ======================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        backend:
            "online",

        epay_configured:
            isConfigured(),

        pin_configured:
            !!EPAY_PIN

    });

});

// ======================================================
// OPERATOR LIST
// ======================================================

app.get("/api/operators", (req, res) => {

    res.json({

        success: true,

        mobile: [

            {
                name: "Airtel",
                code: "AT"
            },

            {
                name: "Airtel GST",
                code: "ATG"
            },

            {
                name: "Airtel WB",
                code: "AP"
            },

            {
                name: "BSNL",
                code: "BT"
            },

            {
                name: "BSNL GST",
                code: "BTG"
            },

            {
                name: "Jio",
                code: "JIO"
            },

            {
                name: "Jio GST",
                code: "143"
            },

            {
                name: "J_SC",
                code: "JSP"
            },

            {
                name: "Vi",
                code: "VI"
            },

            {
                name: "Vi GST",
                code: "VIG"
            }

        ],

        dth: [

            {
                name: "Airtel DTH",
                code: "ATDTH"
            },

            {
                name: "Airtel DTH GST",
                code: "ADG"
            },

            {
                name: "Dish TV",
                code: "DISHTV"
            },

            {
                name: "Dish TV GST",
                code: "DTG"
            },

            {
                name: "Sun Direct",
                code: "SUNDTH"
            },

            {
                name: "Sun Direct GST",
                code: "SDG"
            },

            {
                name: "Tata Sky",
                code: "TATASKY"
            },

            {
                name: "Tata Sky GST",
                code: "TSG"
            },

            {
                name: "Videocon D2H",
                code: "VDDTH"
            },

            {
                name: "Videocon D2H GST",
                code: "VDG"
            }

        ],

        postpaid: [

            {
                name: "Airtel Postpaid",
                code: "PA"
            },

            {
                name: "BSNL Postpaid",
                code: "PB"
            },

            {
                name: "Jio Postpaid",
                code: "PJIO"
            },

            {
                name: "Vi Postpaid",
                code: "PV"
            }

        ]

    });

});

// ======================================================
// BALANCE API
// ======================================================

app.get("/api/balance", async (req, res) => {

    try {

        if (!isConfigured()) {

            return res.status(500).json({

                success: false,

                status:
                    "Error",

                message:
                    "ePayYatra API is not configured"

            });

        }

        const result =
            await epayRequest(
                "balance"
            );

        const data =
            result.data || {};

        return res.status(
            result.ok ? 200 : 502
        ).json({

            success:
                data.status === "Ok",

            status:
                data.status || "Error",

            totalBalance:
                data.totalBalance || "",

            rechargeBalance:
                data.rechargeBalance || "",

            utilityBalance:
                data.utilityBalance || "",

            aepsBalance:
                data.aepsBalance || "",

            message:
                data.message ||
                "Balance response received"

        });

    } catch (error) {

        console.error(
            "Balance Error:",
            error.message
        );

        return res.status(500).json({

            success: false,

            status:
                "Error",

            message:
                "Unable to fetch balance"

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


        // ==================================================
        // VALIDATION
        // ==================================================

        if (!number) {

            return res.status(400).json({

                success: false,

                status:
                    "Error",

                message:
                    "Mobile/DTH number is required"

            });

        }


        if (!amount) {

            return res.status(400).json({

                success: false,

                status:
                    "Error",

                message:
                    "Recharge amount is required"

            });

        }


        if (!operator) {

            return res.status(400).json({

                success: false,

                status:
                    "Error",

                message:
                    "Operator code is required"

            });

        }


        if (!isConfigured()) {

            return res.status(500).json({

                success: false,

                status:
                    "Error",

                message:
                    "ePayYatra API is not configured"

            });

        }


        // ==================================================
        // REFERENCE ID
        // ==================================================

        const referenceId =
            ref_id ||
            `AJSEVA-${Date.now()}`;


        // ==================================================
        // REQUEST
        // ==================================================

        const result =
            await epayRequest(
                "recharge",
                {

                    number:
                        String(number),

                    amount:
                        String(amount),

                    operator:
                        String(operator),

                    ref_id:
                        referenceId,

                    field1:
                        field1,

                    field2:
                        field2,

                    field3:
                        field3,

                    field4:
                        field4,

                    field5:
                        field5

                }
            );


        const data =
            result.data || {};


        const providerStatus =
            String(
                data.status ||
                "Error"
            );


        // ==================================================
        // IMPORTANT:
        // ePayYatra "Accepted" does NOT mean final Success.
        // ==================================================

        const successfulRequest =
            result.ok &&
            (
                providerStatus === "Accepted" ||
                providerStatus === "Pending" ||
                providerStatus === "Success"
            );


        return res.status(
            result.ok ? 200 : 502
        ).json({

            success:
                successfulRequest,

            status:
                providerStatus,

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
                "Recharge response received"

        });

    } catch (error) {

        console.error(
            "Recharge Error:",
            error.message
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

});

// ======================================================
// STATUS CHECK API
// ======================================================

app.get(
    "/api/status/:refId",
    async (req, res) => {

        try {

            const refId =
                req.params.refId;

            if (!refId) {

                return res.status(400).json({

                    success: false,

                    status:
                        "Error",

                    message:
                        "Reference ID is required"

                });

            }


            if (!isConfigured()) {

                return res.status(500).json({

                    success: false,

                    status:
                        "Error",

                    message:
                        "ePayYatra API is not configured"

                });

            }


            const rechargeDate =
                req.query.date ||
                new Date()
                    .toISOString()
                    .slice(0, 10);


            const result =
                await epayRequest(
                    "statusByRefId",
                    {

                        ref_id:
                            refId,

                        recharge_date:
                            rechargeDate

                    }
                );


            const data =
                result.data || {};


            return res.status(
                result.ok ? 200 : 502
            ).json({

                success:
                    result.ok,

                status:
                    data.status ||
                    "Error",

                number:
                    data.number ||
                    "",

                amount:
                    data.amount ||
                    "",

                operator:
                    data.operator ||
                    "",

                ref_id:
                    data.ref_id ||
                    refId,

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
                    "Status response received"

            });

        } catch (error) {

            console.error(
                "Status Error:",
                error.message
            );

            return res.status(500).json({

                success: false,

                status:
                    "Error",

                message:
                    "Unable to check recharge status"

            });

        }

    }
);

// ======================================================
// COMPLAINT / DISPUTE
// ======================================================

app.post(
    "/api/complain",
    async (req, res) => {

        try {

            const {
                txnId,
                reason
            } = req.body;


            if (!txnId) {

                return res.status(400).json({

                    success: false,

                    status:
                        "Error",

                    message:
                        "Transaction ID is required"

                });

            }


            if (!reason) {

                return res.status(400).json({

                    success: false,

                    status:
                        "Error",

                    message:
                        "Complaint reason is required"

                });

            }


            if (!isConfigured()) {

                return res.status(500).json({

                    success: false,

                    status:
                        "Error",

                    message:
                        "ePayYatra API is not configured"

                });

            }


            const result =
                await epayRequest(
                    "complain",
                    {

                        txn_id:
                            txnId,

                        reason:
                            reason

                    }
                );


            const data =
                result.data || {};


            return res.status(
                result.ok ? 200 : 502
            ).json({

                success:
                    data.status === "Accepted",

                status:
                    data.status ||
                    "Error",

                complain_id:
                    data.complain_id ||
                    "",

                message:
                    data.message ||
                    "Complaint response received"

            });

        } catch (error) {

            console.error(
                "Complaint Error:",
                error.message
            );

            return res.status(500).json({

                success: false,

                status:
                    "Error",

                message:
                    "Unable to submit complaint"

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

        const data = {

            ...req.query,

            ...req.body

        };


        console.log(
            "===================================="
        );

        console.log(
            "EPAYYATRA CALLBACK"
        );

        console.log(
            JSON.stringify(
                data,
                null,
                2
            )
        );

        console.log(
            "===================================="
        );


        res.json({

            success: true,

            message:
                "Callback received"

        });

    }
);

// ======================================================
// 404
// ======================================================

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            status:
                "Not Found",

            message:
                `API endpoint not found: ${req.method} ${req.path}`

        });

    }
);

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            status:
                "Error",

            message:
                "Internal server error"

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
