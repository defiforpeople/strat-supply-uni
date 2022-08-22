import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { SupplyUni } from "../typechain-types";
const logger = require("pino")();

const GAS_LIMIT = BigNumber.from("2074000");

export async function retrieveNFT(
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

  logger.info("Retrieving NFT of the position...");
  const tx = await supplyUni.connect(user).retrieveNFT(poolId, gas);
  await tx.wait();
  logger.info("Position retrieved!");

  return tx;
}
