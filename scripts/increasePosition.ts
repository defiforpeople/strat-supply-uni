import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import { SupplyUni, IERC20 } from "../typechain-types";
const logger = require("pino")();

const GAS_LIMIT = 2074000;

export async function increasePosition(
  supplyUniAddr: string,
  poolId: BigNumber,
  userAddr: string,
  token0Addr: string,
  token1Addr: string,
  amm0: BigNumber,
  amm1: BigNumber,
  maxSlip: BigNumber
): Promise<ContractTransaction> {
  // get signer
  const user = await ethers.getSigner(userAddr);

  // get strat contract
  const supplyUni = (await ethers.getContractAt(
    "SupplyUni",
    supplyUniAddr
  )) as SupplyUni;

  // get tokens
  const token0 = (await ethers.getContractAt("IERC20", token0Addr)) as IERC20;
  const token1 = (await ethers.getContractAt("IERC20", token1Addr)) as IERC20;

  const gas = { gasLimit: GAS_LIMIT };
  logger.info("Approving...");
  await token0.connect(user).approve(supplyUni.address, amm0, gas);
  await token1.connect(user).approve(supplyUni.address, amm1, gas);
  logger.info("Approved!");

  logger.info("Increasing position...");
  const tx = await supplyUni
    .connect(user)
    .increasePosition(poolId, amm0, amm1, maxSlip, gas);
  await tx.wait();
  logger.info("Position Increased!");

  return tx;
}
