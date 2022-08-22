import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { SupplyUni } from "../typechain-types";
const logger = require("pino")();

const GAS_LIMIT = BigNumber.from("2074000");

export async function collectAllFees(
  supplyUniAddr: string,

  poolId: BigNumber,
  userAddr: string
): Promise<ContractTransaction> {
  const gas = { gasLimit: GAS_LIMIT };

  const user = await ethers.getSigner(userAddr);
  const supplyUni = (await ethers.getContractAt(
    "SupplyUni",
    supplyUniAddr
  )) as SupplyUni;

  logger.info("Collecting all fees...");
  const tx = await supplyUni.connect(user).collectAllFees(poolId, gas);
  await tx.wait();
  logger.info("Fees collected!");

  return tx;
}
