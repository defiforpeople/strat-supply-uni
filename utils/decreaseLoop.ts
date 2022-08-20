import { BigNumber } from "ethers";
import { ethers } from "hardhat";
const logger = require("pino")();

const { CONTRACT_ADDRESS } = process.env;

export default async function decreaseLoop(
  userAddr: string,
  userliquidity: BigNumber,
  poolId: BigNumber,
  maxSlip: BigNumber,
  contractAddr?: string
): Promise<BigNumber> {
  const zero = BigNumber.from(0);
  const strategyAddr = CONTRACT_ADDRESS ? CONTRACT_ADDRESS : contractAddr;
  const supplyUni = await ethers.getContractAt("SupplyUni", `${strategyAddr}`);
  const user = await ethers.getSigner(userAddr);
  logger.info(`strat addr: ${supplyUni.address}`);
  logger.info(`userAddr: ${user.address}`);

  let count = 0;
  let liquidity = userliquidity;
  while (liquidity.gt(zero)) {
    count += 1;
    logger.info(`count: ${count}`);
    // decrease position
    logger.info("Decreasing position...");
    let tx = await supplyUni
      .connect(user)
      .decreasePosition(poolId, 100, maxSlip);
    await tx.wait();
    logger.info("Position decreased!");

    const { liquidity: userliquidity } = await supplyUni.getOwnerInfo(
      userAddr,
      poolId
    );
    liquidity = userliquidity;
  }

  logger.info(`liquidity ${liquidity}`);
  return liquidity;
}
