import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { SupplyUni } from "../typechain-types";
const logger = require("pino")();

const GAS_LIMIT = BigNumber.from("2074000");

export async function addPool(
  supplyUniAddr: string,
  token0Addr: string,
  token1Addr: string,
  poolFee: BigNumber
): Promise<ContractTransaction> {
  const gas = { gasLimit: GAS_LIMIT };
  const [owner] = await ethers.getSigners();
  const supplyUni = (await ethers.getContractAt(
    "SupplyUni",
    supplyUniAddr
  )) as SupplyUni;

  logger.info("Adding new pool...");
  const tx = await supplyUni
    .connect(owner)
    .addPool(token0Addr, token1Addr, poolFee, gas);
  await tx.wait();
  logger.info("Pool added!");

  return tx;
}
