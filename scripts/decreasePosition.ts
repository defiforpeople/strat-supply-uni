import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";
import decreaseLoop from "../utils/decreaseLoop";
const logger = require("pino")();

const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = BigNumber.from("2074040");

export default async function decreasePosition(
  poolId: BigNumber,
  userAddr: string,
  percentageAmm: BigNumber,
  maxSlip: BigNumber
): Promise<ContractTransaction> {
  // get signer
  const user = await ethers.getSigner(userAddr);

  // get strat contract
  const supplyUni = await ethers.getContractAt(
    "SupplyUni",
    `${CONTRACT_ADDRESS}`
  );

  // get liquidity
  const { liquidity: liqOwnerBef } = await supplyUni.getOwnerInfo(
    user.address,
    poolId
  );
  logger.info(`liquidity before decreasing: ${liqOwnerBef}`);

  // for assert post tx if the decrease is completed or not
  const liquidityExpected = liqOwnerBef
    .mul(percentageAmm)
    .div(BigNumber.from(100));
  logger.info(`liquidity expected: ${liquidityExpected}`);

  const gas = { gasLimit: GAS_LIMIT };
  logger.info("Decreasing position...");
  let tx = await supplyUni
    .connect(user)
    .decreasePosition(poolId, percentageAmm, maxSlip, gas);
  await tx.wait();
  logger.info("Position decreased!");

  const { liquidity: liqOwnerAfter } = await supplyUni.getOwnerInfo(
    user.address,
    poolId
  );
  logger.info(`liquidity remaining after: ${liqOwnerAfter}`);

  // Sometimes the pool doesn't decrease the expected liquidity
  // In that case, the same tx is executed in order to get the expected one
  if (liqOwnerAfter.gt(GAS_LIMIT) && liqOwnerAfter.lt(liquidityExpected)) {
    const liquidityNeeded = liquidityExpected.sub(liqOwnerAfter);
    logger.info(`liquidityNeeded: ${liquidityNeeded}`);
    logger.info("Entering loop...");
    tx = await decreaseLoop(
      poolId,
      user.address,
      liqOwnerAfter,
      liquidityNeeded,
      maxSlip
    );
  }

  return tx;
}
