import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SupplyUni } from "../typechain-types";
const logger = require("pino")();

const GAS_LIMIT = BigNumber.from("2074000");
const gas = { gasLimit: GAS_LIMIT };
const addPool = async (
  conractAddr: string,
  token0Addr: string,
  token1Addr: string,
  poolFee: BigNumber
) => {
  const [owner] = await ethers.getSigners();
  const supplyUni = (await ethers.getContractAt(
    "SupplyUni",
    conractAddr
  )) as SupplyUni;

  logger.info("Adding new pool...");
  const tx = await supplyUni
    .connect(owner)
    .addPool(token0Addr, token1Addr, poolFee, gas);
  await tx.wait();
  logger.info("Pool added!");
};

export default addPool;
