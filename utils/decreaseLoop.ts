import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
const logger = require("pino")();

const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = BigNumber.from("2074040");
let tx: ContractTransaction;

export default async function decreaseLoop(
  poolId: BigNumber,
  userAddr: string,
  liquidityRemaining: BigNumber,
  liquidityNeeded: BigNumber,
  maxSlip: BigNumber,
  contractAddr?: string // for unit tests in local
): Promise<ContractTransaction> {
  const strategyAddr = CONTRACT_ADDRESS ? CONTRACT_ADDRESS : contractAddr;
  const supplyUni = await ethers.getContractAt("SupplyUni", `${strategyAddr}`);
  logger.info(`strat addr: ${supplyUni.address}`);

  const user = await ethers.getSigner(userAddr);
  logger.info(`userAddr: ${user.address}`);

  logger.info(`liquidity remaining: ${liquidityRemaining}`);
  logger.info(`liquidity needed   : ${liquidityNeeded}`);

  let liquidity = liquidityRemaining;
  let neededLiq = liquidityNeeded.sub(liquidity);
  let count = 0;
  while (liquidity.lt(liquidityNeeded) && liquidity.gt(GAS_LIMIT)) {
    // for accounting the tx needed
    count += 1;
    logger.info(`count: ${count}`);

    // get the percentage to decrease by the dif between the liquidity
    // in Uniswap and the liquidity that is needed
    let percentageNeeded = neededLiq.mul(BigNumber.from(100)).div(neededLiq);

    percentageNeeded = percentageNeeded.add(1).lt(100)
      ? percentageNeeded.add(1)
      : BigNumber.from(100);
    logger.info(`percentageNeeded: ${percentageNeeded}`);

    const liqBefore = liquidity;
    // decrease position
    const gas = { gasLimit: GAS_LIMIT };
    logger.info("Decreasing position...");
    tx = await supplyUni
      .connect(user)
      .decreasePosition(poolId, percentageNeeded, maxSlip, gas);
    await tx.wait();
    logger.info("Position decreased!");

    // get againg the liquidity for the loop to continue or not
    const { liquidity: liqUserAfter } = await supplyUni.getOwnerInfo(
      userAddr,
      poolId
    );
    logger.info(`liqUserAfter: ${liqUserAfter}`);

    liquidity = liqUserAfter;
    neededLiq = neededLiq.sub(liqBefore.sub(liqUserAfter));
  }

  logger.info(`liquidity: ${liquidity}`);
  logger.info(`neededLiq: ${neededLiq}`);
  return tx;
}
