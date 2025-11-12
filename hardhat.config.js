require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 50,
      },
    },
  },
  mocha: {
    reporter: "mochawesome",
    reporterOptions: {
      reportDir: "mochawesome-report",
      reportFilename: "fund-test-report",
      quiet: true,
      overwrite: true,
      html: true,
      json: false,
    },
  },
  networks: {
    sepolia: {
      url:
        process.env.SEPOLIA_RPC_URL ||
        "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
