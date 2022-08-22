import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
const logger = require("pino")();

const GAS_LIMIT = BigNumber.from("2074000");
let tx: ContractTransaction;

export default async function decreaseLoop(
  supplyUniAddr: string,
  poolId: BigNumber,
  userAddr: string,
  liquidityRemaining: BigNumber,
  liquidityNeeded: BigNumber,
  maxSlip: BigNumber
): Promise<ContractTransaction> {
  const supplyUni = await ethers.getContractAt("SupplyUni", supplyUniAddr!);
  const user = await ethers.getSigner(userAddr);

  let liquidity = liquidityRemaining;
  let neededLiq = liquidityRemaining.sub(liquidityNeeded);
  const expectedLiq = liquidityNeeded;
  let count = 0;
  while (liquidity.gt(expectedLiq) && liquidity.gt(GAS_LIMIT)) {
    // for accounting the tx needed
    count += 1;
    logger.info(`count: ${count}`);

    // get the percentage to decrease by the dif between the liquidity
    // in Uniswap and the liquidity that is needed
    let percentageNeeded = neededLiq
      .mul(BigNumber.from(100))
      .div(liquidityRemaining);

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
      user.address,
      poolId
    );

    liquidity = liqUserAfter;
    neededLiq = neededLiq.sub(liqBefore.sub(liqUserAfter));
  }

  logger.info(`liquidity at the end of the loop: ${liquidity}`);
  logger.info(`neededLiq at the end of the loop: ${neededLiq}`);
  return tx;
}
