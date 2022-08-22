import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

import pino from "pino";
const logger = pino();
const found = process.argv.indexOf("--network");
const networkName = process.argv[found + 1];
if (!networkName) {
  throw new Error("invalid network name");
}

console.log("network", networkName);
dotenv.config({
  path: `.env.${networkName}`,
});

// Uniswap V3 Periphery settings
const DEFAULT_COMPILER_SETTINGS = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 1_000_000,
    },
    metadata: {
      bytecodeHash: "none",
    },
  },
};

const networkConfig = {
  url: process.env.URL || "",
  accounts:
    process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
};

const secondPk = process.env.PRIVATE_KEY2;
if (secondPk) {
  networkConfig.accounts.push(secondPk);
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [DEFAULT_COMPILER_SETTINGS],
  },
  networks: {
    polygon: networkConfig,
    mumbai: networkConfig,
    rinkeby: networkConfig,
    hardhat: {
      forking: {
        url: process.env.URL || "",
      },
    },
  },
  mocha: {
    timeout: 100000000,
  },
};

export default config;
