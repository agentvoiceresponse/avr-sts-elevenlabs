require("dotenv").config();

const axios = require("axios");

module.exports = {
  name: "avr_hangup",
  description:
    "Ends the call when the customer has no further information to request, after all relevant actions have been completed, or when the customer explicitly says goodbye, ensuring a clean and graceful termination of the interaction.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (uuid, {}) => {
    console.log("Hangup call");
    const url = process.env.AMI_URL || "http://127.0.0.1:6006";
    try {
      const res = await axios.post(`${url}/hangup`, { uuid });
      console.log("Hangup response:", res.data);
      return res.data.message;
    } catch (error) {
      console.error("Error during hangup:", error.message);
      return `Error during hangup: ${error.message}`;
    }
  },
};
