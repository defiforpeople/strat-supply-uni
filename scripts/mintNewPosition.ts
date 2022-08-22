import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
const logger = require("pino")();

const GAS_LIMIT = 2074040;

export async function mintNewPosition(
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
  const supplyUni = await ethers.getContractAt("SupplyUni", supplyUniAddr);

  // get tokens
  const token0 = await ethers.getContractAt("IERC20", token0Addr);
  const token1 = await ethers.getContractAt("IERC20", token1Addr);

  // aprove strat contract from signer
  const gas = { gasLimit: GAS_LIMIT };
  logger.info("Approving...");
  await token0.connect(user).approve(supplyUni.address, amm0, gas);
  await token1.connect(user).approve(supplyUni.address, amm1, gas);
  logger.info("Approved!");

  // mint new position in strat contract
  logger.info("Supplying...");
  const tx = await supplyUni
    .connect(user)
    .mintNewPosition(poolId, amm0, amm1, maxSlip, gas);
  await tx.wait();
  logger.info("Deposited!");

  return tx;
}
