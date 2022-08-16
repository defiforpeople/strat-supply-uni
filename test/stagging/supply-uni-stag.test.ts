import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, network } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SupplyUni, IERC20 } from "../../typechain-types";
import addPool from "../../scripts/addPool";
const logger = require("pino")();
use(waffleChai);

const { TOKEN0_ADDRESS, TOKEN1_ADDRESS, CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = BigNumber.from("2074000");
const gas = { gasLimit: GAS_LIMIT };

if (network.name === ("hardhat" || "localhost")) {
  describe.skip;
} else {
  logger.info("Stagging test of SupplyUni!");

  describe("supplyUni", () => {
    let owner: SignerWithAddress;
    let token0: IERC20;
    let token1: IERC20;
    let amount: BigNumber;
    let supplyUni: SupplyUni;
    let lastPoolId: BigNumber;
    let poolFee: BigNumber;

    beforeEach(async () => {
      [owner] = await ethers.getSigners();

      supplyUni = await ethers.getContractAt(
        "SupplyUni",
        `${CONTRACT_ADDRESS}`
      );

      token0 = await ethers.getContractAt("IERC20", `${TOKEN0_ADDRESS}`);
      token1 = await ethers.getContractAt("IERC20", `${TOKEN1_ADDRESS}`);

      const ownerBalance = await ethers.provider.getBalance(owner.address);
      logger.info(`owner ETH balance at beggining   : ${ownerBalance}`);

      const token0Balance = await token0.balanceOf(owner.address);
      const token1Balance = await token1.balanceOf(owner.address);
      logger.info(`token0 owner balance at beggining: ${token0Balance}`);
      logger.info(`token1 owner balance at beggining: ${token1Balance}`);

      amount = token0Balance.gt(token1Balance) ? token1Balance : token0Balance;
      amount = amount.div(20);
      logger.info(`amount                           : ${amount}`);

      // id of the pool
      lastPoolId = (await supplyUni.connect(owner).poolCount()).sub(1);
      poolFee = BigNumber.from("100");

      // if there isn't pools created, create one
      if (lastPoolId.lt(BigNumber.from(0))) {
        await addPool(
          `${CONTRACT_ADDRESS}`,
          token0.address,
          token1.address,
          poolFee
        );
        lastPoolId = lastPoolId.add(1);
      }

      // compare if the pool is already initialized
      const pool = await supplyUni.getPool(lastPoolId);
      const initialized = true;
      const lastPool = [token0.address, token1.address, poolFee, initialized];

      // create the pool if is not initialized yet with the params we set
      if (pool.toString() !== lastPool.toString()) {
        await addPool(
          `${CONTRACT_ADDRESS}`,
          token0.address,
          token1.address,
          poolFee
        );
        lastPoolId = lastPoolId.add(1);
      }
      logger.info(`lastPoolId ${lastPoolId}`);
    });

    describe.only("test all the functions", () => {
      it("should mint, add liquidity, withdraw, collect the fees and retrieve the position NFT", async () => {
        const zero = BigNumber.from(0);

        logger.info("Approving...");
        await token0.connect(owner).approve(supplyUni.address, amount, gas);
        await token1.connect(owner).approve(supplyUni.address, amount, gas);
        logger.info("Approved!");

        logger.info("Supplying...");
        // Mint new position by supplying liquidity
        let tx = await supplyUni
          .connect(owner)
          .mintNewPosition(lastPoolId, amount, amount, gas);
        await tx.wait();
        logger.info("Supplied");

        // get the owner info
        const { tokenId, liquidity, amount0, amount1 } = await supplyUni
          .connect(owner)
          .getOwnerInfo(owner.address, lastPoolId);

        logger.info(`tokenId ${tokenId}`);
        logger.info(`liquidity ${liquidity}`);
        logger.info(`amount0 ${amount0}`);
        logger.info(`amount1 ${amount1}`);

        let token0OwnerAmm = (await token0.balanceOf(owner.address)).div(5);
        let token1OwnerAmm = (await token1.balanceOf(owner.address)).div(5);

        logger.info("Approving...");
        await token0.approve(supplyUni.address, token0OwnerAmm);
        await token1.approve(supplyUni.address, token1OwnerAmm);
        logger.info("Approved");

        logger.info(`token0 owner amount to increase : ${token0OwnerAmm}`);
        logger.info(`token1 owner amount to increase: ${token1OwnerAmm}`);

        // increase position
        logger.info("Increasing position...");
        tx = await supplyUni
          .connect(owner)
          .increasePosition(lastPoolId, token0OwnerAmm, token1OwnerAmm, gas);
        await tx.wait();
        logger.info("Position Increased");

        token0OwnerAmm = await token0.balanceOf(owner.address);
        token1OwnerAmm = await token1.balanceOf(owner.address);

        logger.info(`token0 owner balance after increasing: ${token0OwnerAmm}`);
        logger.info(`token1 owner balance after increasing: ${token1OwnerAmm}`);

        const token0ContractBef = await token0.balanceOf(supplyUni.address);
        const token1ContractBef = await token1.balanceOf(supplyUni.address);

        logger.info(
          `token0 contract balance  before decreasing: ${token0ContractBef}`
        );
        logger.info(
          `token1 contract balance before decreasing : ${token1ContractBef}`
        );

        // decrease position
        const withdrawPercentage = 100;
        logger.info("Decreasing position...");
        tx = await supplyUni
          .connect(owner)
          .decreasePosition(lastPoolId, withdrawPercentage, gas);
        await tx.wait();
        logger.info("Position decreased");

        const token0ContractAfter = await token0.balanceOf(supplyUni.address);
        const token1ContractAfter = await token1.balanceOf(supplyUni.address);

        logger.info(
          `token0 contract balance after decreasing: ${token0ContractAfter}`
        );
        logger.info(
          `token1 contract balance after decreasing: ${token1ContractAfter}`
        );

        const token0OwnerBalance = await token0.balanceOf(owner.address);
        const token1OwnerBalance = await token1.balanceOf(owner.address);

        logger.info(`token0 owner balance  after : ${token0OwnerBalance}`);
        logger.info(`token1 owner balance after: ${token1OwnerBalance}`);

        // collect the fees earned for supplying liquidity
        tx = await supplyUni.connect(owner).collectAllFees(lastPoolId, gas);
        await tx.wait();
        logger.info("Collected!");

        const daiContractAfter = await token0.balanceOf(supplyUni.address);
        const usdcContractAfter = await token1.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractAfter}`);
        logger.info(`usdc contract balance after: ${usdcContractAfter}`);

        // give the NFT of the position to the user and delete the info from the storage
        tx = await supplyUni.connect(owner).retrieveNFT(lastPoolId, gas);
        await tx.wait();

        const ownerInfo = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );
        logger.info(ownerInfo);

        // This data shouldn't exist
        expect(ownerInfo[0]).to.be.eq(zero);
      });
    });

    describe("mintNewPosition", () => {
      it("should save correctly the state of the sender deposit in the contract", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await token0.connect(owner).approve(supplyUni.address, amount, gas);
        await token1.connect(owner).approve(supplyUni.address, amount, gas);
        logger.info("Approved!");

        const token0OwnerAmmBefore = await token0.balanceOf(owner.address);
        const token1OwnerAmmBefore = await token1.balanceOf(owner.address);

        logger.info(`token0 owner balance  before: ${token0OwnerAmmBefore}`);
        logger.info(`token1 owner balance before: ${token1OwnerAmmBefore}`);

        logger.info("Supplying...");
        const tx = await supplyUni
          .connect(owner)
          .mintNewPosition(lastPoolId, amount, amount, gas);
        await tx.wait();
        logger.info("Supplied");

        const { tokenId, liquidity, amount0, amount1 } = await supplyUni
          .connect(owner)
          .getOwnerInfo(owner.address, lastPoolId);

        logger.info(`tokenId ${tokenId}`);
        logger.info(`liquidity ${liquidity}`);
        logger.info(`amount0 ${amount0}`);
        logger.info(`amount1 ${amount1}`);

        const token0OwnerBalance = await token0.balanceOf(owner.address);
        const token1OwnerBalance = await token1.balanceOf(owner.address);

        expect(tokenId).to.be.gt(zero);
        expect(amount0).to.be.eq(token0OwnerAmmBefore.sub(token0OwnerBalance));
        expect(amount1).to.be.eq(token1OwnerAmmBefore.sub(token1OwnerBalance));
        expect(liquidity).to.be.gt(zero);
        // expect(liquidity).to.be.eq(finalLiq);
        // expect(liquidity).to.be.eq(amount0.add(amount1)); // For some reason, liquidity is NOT amount0 + amount1 - poolFee.
        // The result is 999982856505346 while amount0 + amount1 is 999965713305537627532
      });
    });

    describe("retrieveNFT", () => {
      it("should retrieve NFT of a position correctly", async () => {
        const zero = BigNumber.from(0);
        const { tokenId } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );
        logger.info(tokenId);
        if (!tokenId) {
          logger.info("There is no position to retrieve!");
          describe.skip;
        }

        const tx = await supplyUni.connect(owner).retrieveNFT(lastPoolId, gas);
        await tx.wait();

        const ownerInfo = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );
        logger.info(ownerInfo);

        expect(ownerInfo[0]).to.be.eq(zero);
      });
    });
  });
}
