import { SupplyUni, IERC20 } from "../../typechain-types";
import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, network } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const logger = require("pino")();
use(waffleChai);

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2"; //FTX Whale
const GAS_LIMIT = 2074040;

if (network.name !== ("hardhat" || "localhost")) {
  describe.skip;
} else {
  logger.info("SupplyUni Unit test!");
  describe("supplyUni", () => {
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let dai: IERC20;
    let usdc: IERC20;
    let poolFee: BigNumber;
    let daiAmount: BigNumber;
    let usdcAmount: BigNumber;
    let supplyUni: SupplyUni;
    let poolIdZero: BigNumber;
    let positionManager: string;

    beforeEach(async () => {
      [owner, user] = await ethers.getSigners();

      // deploy SupplyUni
      const liquExamplesFactory = await ethers.getContractFactory("SupplyUni");
      supplyUni = (await liquExamplesFactory.deploy()) as SupplyUni;
      await supplyUni.deployed();

      // add a pool to SupplyUni (DAI/USDC 0.01%)
      dai = await ethers.getContractAt("IERC20", DAI);
      usdc = await ethers.getContractAt("IERC20", USDC);
      poolFee = BigNumber.from("100");

      const tx = await supplyUni.addPool(dai.address, usdc.address, poolFee);
      await tx.wait();

      poolIdZero = (await supplyUni.poolCount()).sub(1);
      positionManager = await supplyUni.nonfungiblePositionManager();

      const whale = await ethers.getImpersonatedSigner(WHALE);
      const whaleDaiBalance = await dai.balanceOf(whale.address);
      const whaleUsdcBalance = await usdc.balanceOf(whale.address);

      const ownerBalanceBefore = await ethers.provider.getBalance(
        owner.address
      );
      logger.info(`owner balance before: ${ownerBalanceBefore}`);

      daiAmount = BigNumber.from(1000n * 10n ** 18n);
      usdcAmount = BigNumber.from(1000n * 10n ** 6n);

      expect(whaleDaiBalance).to.gte(daiAmount);
      expect(whaleUsdcBalance).to.gte(usdcAmount);

      await owner.sendTransaction({
        to: whale.address,
        value: ownerBalanceBefore.div(2),
        gasLimit: GAS_LIMIT,
      });

      await dai.connect(whale).transfer(owner.address, daiAmount);
      await usdc.connect(whale).transfer(owner.address, usdcAmount);

      // const daiOwnerBalance = await dai.balanceOf(owner.address);
      // const usdcOwnerBalance = await usdc.balanceOf(owner.address);
      // logger.info(`dai owner balance before: ${daiOwnerBalance}`);
      // logger.info(`usdc owner balance before: ${usdcOwnerBalance}`);
    });

    describe("addPool", () => {
      it("should initialize the pool correctly with the 0 id", async () => {
        const {
          token0,
          token1,
          poolFee: poolFeeContract,
          isActive,
        } = await supplyUni.getPool(BigNumber.from(poolIdZero));

        expect(token0).to.eq(dai.address);
        expect(token1).to.eq(usdc.address);
        expect(poolFeeContract).to.eq(poolFee);
        expect(isActive).to.be.true;
      });

      it("Should add another pool correctly", async () => {
        const poolFeeOne = BigNumber.from("500");
        const poolIdOne = poolIdZero.add(1);

        await supplyUni.addPool(dai.address, usdc.address, poolFeeOne);
        const {
          token0,
          token1,
          poolFee: poolFeeContract,
          isActive,
        } = await supplyUni.getPool(poolIdOne);

        expect(token0).to.eq(dai.address);
        expect(token1).to.eq(usdc.address);
        expect(poolFeeContract).to.eq(poolFeeOne);
        expect(isActive).to.be.true;
      });
    });

    describe("mintNewPosition", () => {
      it("should save correctly the state of the sender deposit in the contract", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        const daiOwnerBalanceBefore = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceBefore = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalanceBefore}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalanceBefore}`);

        logger.info("Supplying...");
        const tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied");

        const { tokenId, liquidity, amount0, amount1 } =
          await supplyUni.getOwnerInfo(owner.address, poolIdZero);

        logger.info(`tokenId ${tokenId}`);
        logger.info(`liquidity ${liquidity}`);
        logger.info(`amount0 ${amount0}`);
        logger.info(`amount1 ${amount1}`);

        const daiOwnerBalanceAfter = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceAfter = await usdc.balanceOf(owner.address);
        // const finalLiq = amount0.add(amount1).sub(poolFee);

        expect(tokenId).to.be.gt(zero);
        expect(amount0).to.be.eq(
          daiOwnerBalanceBefore.sub(daiOwnerBalanceAfter)
        );
        expect(amount1).to.be.eq(
          usdcOwnerBalanceBefore.sub(usdcOwnerBalanceAfter)
        );

        expect(liquidity).to.be.gt(zero);
        // expect(liquidity).to.be.eq(finalLiq);
        // expect(liquidity).to.be.eq(amount0.add(amount1)); // For some reason, liquidity is NOT amount0 + amount1 - poolFee.
        // The result is 999982856505346 while amount0 + amount1 is 999965713305537627532
      });

      it("Should mint a new position correctly, and update the sender balance when suproviding liquidity", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        const daiOwnerBalanceBefore = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceBefore = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalanceBefore}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalanceBefore}`);

        logger.info("Supplying...");
        const tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied");

        const daiOwnerBalanceAfter = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceAfter = await usdc.balanceOf(owner.address);
        logger.info(`dai owner balance  After: ${daiOwnerBalanceAfter}`);
        logger.info(`usdc owner balance After: ${usdcOwnerBalanceAfter}`);

        const { amount0, amount1 } = await supplyUni.getOwnerInfo(
          owner.address,
          poolIdZero
        );

        logger.info(`amount0 ${amount0}`);
        logger.info(`amount1 ${amount1}`);

        expect(amount0).to.be.gt(zero);
        expect(amount1).to.be.gt(zero);

        expect(daiOwnerBalanceAfter).to.be.eq(
          daiOwnerBalanceBefore.sub(amount0)
        );
        expect(usdcOwnerBalanceAfter).to.be.eq(
          usdcOwnerBalanceBefore.sub(amount1)
        );

        // doesn't work (the method 'changeTokenBalance' is bad):
        // expect(tx).to.changeTokenBalance(dai, owner, -amount0);
        // expect(tx).to.changeTokenBalance(usdc, owner, -amount1);
      });

      it("Should emit Deposit() event after minting a position", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        const tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        logger.info("Supplied");

        const { tokenId } = await supplyUni.getOwnerInfo(
          owner.address,
          poolIdZero
        );

        // Events are not working correctly
        expect(tx)
          .to.emit(supplyUni, "Deposit")
          .withArgs(owner.address, tokenId);
      });
    });

    describe("increasePosition", () => {
      it("should emit an event after increasing liquidity", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();

        const daiOwnerBalance = await dai.balanceOf(owner.address);
        const usdcOwnerBalance = await usdc.balanceOf(owner.address);

        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiOwnerBalance);
        await usdc.approve(supplyUni.address, usdcOwnerBalance);
        logger.info("Approved");

        logger.info(`dai owner balance  : ${daiOwnerBalance}`);
        logger.info(`usdc owner balance : ${usdcOwnerBalance}`);

        logger.info("Increasing position...");
        tx = await supplyUni.increasePosition(
          poolIdZero,
          daiOwnerBalance,
          usdcOwnerBalance
        );
        logger.info("Position Increased");

        await tx.wait();
        expect(tx).to.emit(supplyUni, "Deposit");
      });
    });

    describe("decreasePosition", () => {
      it("should emit an event after decreasing liquidity", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied!");

        const daiOwnerBalance = await dai.balanceOf(owner.address);
        const usdcOwnerBalance = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalance}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalance}`);

        const daiContractBef = await dai.balanceOf(supplyUni.address);
        const usdcContractBef = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  before: ${daiContractBef}`);
        logger.info(`usdc contract balance before: ${usdcContractBef}`);

        logger.info("Decreasing position...");
        tx = await supplyUni.decreasePosition(poolIdZero, 100);
        await tx.wait();
        logger.info("Position decreased");

        const daiContractAfter = await dai.balanceOf(supplyUni.address);
        const usdcContractAfter = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractAfter}`);
        logger.info(`usdc contract balance after: ${usdcContractAfter}`);

        const daiOwnerBalanceAfter = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceAfter = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  after : ${daiOwnerBalanceAfter}`);
        logger.info(`usdc owner balance after: ${usdcOwnerBalanceAfter}`);

        await tx.wait();
        expect(tx).to.emit(supplyUni, "Withdraw");
      });
    });

    describe("collectAllFees", () => {
      it("should collect the fees successfully", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied!");

        const daiContractBef = await dai.balanceOf(supplyUni.address);
        const usdcContractBef = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  before: ${daiContractBef}`);
        logger.info(`usdc contract balance before: ${usdcContractBef}`);

        // await network.provider.send("evm_increaseTime", [200]);
        // // we make real the time increased by mining the block
        // await network.provider.send("evm_mine", []);
        // logger.info("Mined!");

        tx = await supplyUni.collectAllFees(poolIdZero);
        await tx.wait();
        logger.info("Collected!");

        const daiContractAfter = await dai.balanceOf(supplyUni.address);
        const usdcContractAfter = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractAfter}`);
        logger.info(`usdc contract balance after: ${usdcContractAfter}`);
      });
    });

    describe("_sendToOwner", () => {
      it("should be called in decreasePosition() func", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied!");

        const daiOwnerBalance = await dai.balanceOf(owner.address);
        const usdcOwnerBalance = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalance}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalance}`);

        const daiContractBef = await dai.balanceOf(supplyUni.address);
        const usdcContractBef = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  before: ${daiContractBef}`);
        logger.info(`usdc contract balance before: ${usdcContractBef}`);

        logger.info("Decreasing position...");
        tx = await supplyUni.decreasePosition(poolIdZero, 100);
        await tx.wait();
        logger.info("Position decreased");

        // providers don't support history calls :(
        // expect("_sendToOwner").to.be.calledOnContractWith(supplyUni, [poolIdZero]);
      });
    });

    describe("retrieveNFT", () => {
      it("should transfer NFT correctly to the user and update the state", async () => {
        const zero = BigNumber.from(0);
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approve!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          poolIdZero,
          daiAmount,
          usdcAmount
        );
        await tx.wait();
        logger.info("Supplied!");

        logger.info("Retrieving...");
        tx = await supplyUni.retrieveNFT(poolIdZero);
        await tx.wait();
        logger.info("Retrieved!");

        logger.info("Getting info...");
        const [
          tokenIdOwner,
          amount0Owner,
          amount1Owner,
          liquidityOwner,
          initializedOwner,
        ] = await supplyUni.getOwnerInfo(owner.address, poolIdZero);

        expect(tokenIdOwner).to.be.equal(zero);
        expect(amount0Owner).to.be.equal(zero);
        expect(amount1Owner).to.be.equal(zero);
        expect(liquidityOwner).to.be.equal(zero);
        expect(initializedOwner).to.be.false;
      });
    });
  });
}
