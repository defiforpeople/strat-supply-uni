import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SupplyUni } from "../../typechain-types";
const logger = require("pino")();

const { CONTRACT_ADDRESS, TOKEN0_ADDRESS, TOKEN1_ADDRESS, POOL_FEE } =
  process.env;
const GAS_LIMIT = BigNumber.from("2074000");

(async () => {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing strategy contract address");
  }

  if (!TOKEN0_ADDRESS) {
    throw new Error("Missing token0 contract address");
  }

  if (!TOKEN1_ADDRESS) {
    throw new Error("Missing token1 contract address");
  }

  if (!POOL_FEE) {
    throw new Error("Missing pool fee");
  }

  const [owner] = await ethers.getSigners();
  const supplyUni = (await ethers.getContractAt(
    "SupplyUni",
    CONTRACT_ADDRESS
  )) as SupplyUni;

  const gas = { gasLimit: GAS_LIMIT };
  logger.info("Adding new pool...");
  const tx = await supplyUni
    .connect(owner)
    .addPool(TOKEN0_ADDRESS, TOKEN1_ADDRESS, POOL_FEE, gas);
  await tx.wait();
  logger.info("Pool added!");
})();
