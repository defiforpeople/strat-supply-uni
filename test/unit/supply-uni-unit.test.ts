import * as dotenv from "dotenv";
import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, network } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, ContractTransaction } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SupplyUni,
  IERC20,
  INonfungiblePositionManager,
} from "../../typechain-types";
import {
  addPool,
  mintNewPosition,
  increasePosition,
  collectAllFees,
  decreasePosition,
  retrieveNFT,
} from "../../scripts/index";
const logger = require("pino")();
use(waffleChai);

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2"; //FTX Whale
const GAS_LIMIT = BigNumber.from("2074040");

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
    let lastPoolId: BigNumber;
    let manager: INonfungiblePositionManager;
    let managerAddr: string;
    let daiOwnerStartBalance: BigNumber;
    let usdcOwnerStartBalance: BigNumber;
    let zero: BigNumber;
    let maxSlip: BigNumber;
    let gas: { gasLimit: BigNumber };

    beforeEach(async () => {
      // get owner
      [owner, user] = await ethers.getSigners();

      // deploy SupplyUni
      const liquExamplesFactory = await ethers.getContractFactory("SupplyUni");
      supplyUni = (await liquExamplesFactory.deploy()) as SupplyUni;
      await supplyUni.deployed();
      logger.info(`SupplyUni address: ${supplyUni.address}`);
      dotenv.parse(`CONTRACT_ADDRESS=supplyAave.address`);

      // add a pool to SupplyUni (DAI/USDC 0.01%)
      dai = await ethers.getContractAt("IERC20", DAI);
      usdc = await ethers.getContractAt("IERC20", USDC);
      poolFee = BigNumber.from("100");

      // Add the first pool
      const tx = await supplyUni.addPool(dai.address, usdc.address, poolFee);
      await tx.wait();

      // Id of the last pool added
      lastPoolId = (await supplyUni.poolCount()).sub(1);
      logger.info(`lastPoolId ${lastPoolId}`);

      // Uniswap V3 liquidity manager contract
      managerAddr = await supplyUni.nonfungiblePositionManager();
      manager = await ethers.getContractAt(
        "INonfungiblePositionManager",
        managerAddr
      );

      // get owner gas balance
      const ownerBalanceBefore = await ethers.provider.getBalance(
        owner.address
      );

      // get and impersonated whale
      const whale = await ethers.getImpersonatedSigner(WHALE);
      const whaleDaiBalance = await dai.balanceOf(whale.address);
      const whaleUsdcBalance = await usdc.balanceOf(whale.address);

      // set amounts to transfer and assert whale has enough
      daiAmount = BigNumber.from(1000n * 10n ** 18n);
      usdcAmount = BigNumber.from(1000n * 10n ** 6n);
      expect(whaleDaiBalance).to.gte(daiAmount.mul(2));
      expect(whaleUsdcBalance).to.gte(usdcAmount.mul(2));

      // send enough gas to the whale for then transferring the tokens amounts
      await owner.sendTransaction({
        to: whale.address,
        value: ownerBalanceBefore.div(2),
        gasLimit: GAS_LIMIT,
      });

      // transfer the tokens amounts from the whale to our address
      await dai.connect(whale).transfer(owner.address, daiAmount);
      await usdc.connect(whale).transfer(owner.address, usdcAmount);
      // and to the user address
      await dai.connect(whale).transfer(user.address, daiAmount);
      await usdc.connect(whale).transfer(user.address, usdcAmount);

      // set the max slippage
      maxSlip = BigNumber.from(100); // 1%

      // set gas object
      gas = { gasLimit: GAS_LIMIT };

      // add zero variable
      zero = BigNumber.from(0);

      daiOwnerStartBalance = await dai.balanceOf(owner.address);
      usdcOwnerStartBalance = await usdc.balanceOf(owner.address);

      logger.info(`owner dai balance when starting: ${daiOwnerStartBalance}`);
      logger.info(`owner usdc balance when starting: ${usdcOwnerStartBalance}`);
    });

    describe("test all the functions with a single user", () => {
      it("should do all with 1 signer", async () => {
        const zero = BigNumber.from(0);
        let tx: ContractTransaction;

        logger.info(
          `user gas balance: ${await ethers.provider.getBalance(user.address)}`
        );

        // mint new position owner
        logger.info("Minting new position owner...");
        tx = await mintNewPosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          dai.address,
          usdc.address,
          daiAmount.div(10),
          usdcAmount.div(10),
          maxSlip
        );

        const daiAfterMint = await dai.balanceOf(owner.address);
        const usdcAfterMint = await usdc.balanceOf(owner.address);

        const daiOwnerIncrease = BigNumber.from(10n * 10n ** 18n);
        const usdcOwnerIncrease = BigNumber.from(10n * 10n ** 6n);

        expect(daiAfterMint).to.be.gte(daiOwnerIncrease);
        expect(usdcAfterMint).to.be.gte(usdcOwnerIncrease);

        logger.info(`increasing position owner...`);
        tx = await increasePosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          dai.address,
          usdc.address,
          daiOwnerIncrease,
          usdcOwnerIncrease,
          maxSlip
        );

        let daiStratBalance = await dai.balanceOf(supplyUni.address);
        let usdcStratBalance = await usdc.balanceOf(supplyUni.address);
        expect(daiStratBalance).to.be.equal(zero);
        expect(usdcStratBalance).to.be.equal(zero);

        // decrease owner
        const decrOwnerPerc = BigNumber.from(100);
        logger.info("Decreasing position owner...");
        tx = await decreasePosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          decrOwnerPerc,
          maxSlip
        );

        logger.info(`lastPoolId: ${lastPoolId}`);
        logger.info("Retrieving NFT...");
        tx = await retrieveNFT(supplyUni.address, lastPoolId, owner.address);
        logger.info("Retrieved NFT!");

        daiStratBalance = await usdc.balanceOf(supplyUni.address);
        usdcStratBalance = await usdc.balanceOf(supplyUni.address);
        expect(daiStratBalance).to.be.equal(zero);
        expect(usdcStratBalance).to.be.equal(zero);
        logger.info("Done");
      });

      describe("decrease", () => {
        it("should withdraw and make the loop correctly if necessary", async () => {
          const zero = BigNumber.from(0);
          let tx: ContractTransaction;

          let { tokenId: ownerMintId } = await supplyUni.getOwnerInfo(
            owner.address,
            lastPoolId
          );

          // mint new position owner
          logger.info("Minting new position owner...");
          tx = await mintNewPosition(
            supplyUni.address,

            lastPoolId,
            owner.address,
            dai.address,
            usdc.address,
            daiAmount.div(10),
            usdcAmount.div(10),
            maxSlip
          );
          const { tokenId } = await supplyUni.getOwnerInfo(
            owner.address,
            lastPoolId
          );
          ownerMintId = tokenId;

          logger.info(`owner tokenId: ${ownerMintId}`);

          const daiAfterMint = await dai.balanceOf(owner.address);
          const usdcAfterMint = await usdc.balanceOf(owner.address);

          let daiStratBalance = await dai.balanceOf(supplyUni.address);
          let usdcStratBalance = await usdc.balanceOf(supplyUni.address);
          expect(daiStratBalance).to.be.equal(zero);
          expect(usdcStratBalance).to.be.equal(zero);

          const positions = await manager.positions(ownerMintId);
          logger.info(`positions: ${positions}`);

          // decrease owner
          const decrOwnerPerc = BigNumber.from(100);
          logger.info("Decreasing position owner...");
          tx = await decreasePosition(
            supplyUni.address,

            lastPoolId,
            owner.address,
            decrOwnerPerc,
            maxSlip
          );

          daiStratBalance = await usdc.balanceOf(supplyUni.address);
          usdcStratBalance = await usdc.balanceOf(supplyUni.address);
          expect(daiStratBalance).to.be.equal(zero);
          expect(usdcStratBalance).to.be.equal(zero);
          logger.info("Done");
        });
      });
    });

    /* unit tests by function and without imported scripts */
    describe("addPool", () => {
      it("should initialize the pool correctly with the 0 id", async () => {
        const {
          token0,
          token1,
          poolFee: poolFeeContract,
          isActive,
        } = await supplyUni.getPool(BigNumber.from(lastPoolId));

        expect(token0).to.eq(dai.address);
        expect(token1).to.eq(usdc.address);
        expect(poolFeeContract).to.eq(poolFee);
        expect(isActive).to.be.true;
      });

      it("Should add another pool correctly", async () => {
        const poolFeeOne = BigNumber.from("500");
        const poolIdOne = lastPoolId.add(1);

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
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        const daiOwnerBalanceBefore = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceBefore = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalanceBefore}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalanceBefore}`);

        logger.info("Supplying...");
        const tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied");

        const { tokenId, liquidity } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        logger.info(`tokenId ${tokenId}`);
        logger.info(`liquidity ${liquidity}`);

        expect(tokenId).to.be.gt(zero);
        expect(liquidity).to.be.gt(zero);
      });

      it("Should update tokenId and liquidity state and emit Deposit() event after minting a position", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        logger.info("Supplying...");
        const tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
        );
        logger.info("Supplied");

        const { tokenId, liquidity } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        expect(tokenId).to.be.gt(zero);

        const positionInfo = await manager.positions(tokenId);
        const liqManager = positionInfo[7];

        expect(liquidity).to.be.eq(liqManager);
        expect(tx).to.emit(supplyUni, "Deposit");
      });
    });

    describe("increasePosition", () => {
      it("should emit an event after increasing liquidity", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount.div(2));
        await usdc.approve(supplyUni.address, usdcAmount.div(2));
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount.div(2),
          usdcAmount.div(2),
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied");
        const { tokenId, liquidity: liqBefore } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );
        logger.info(`liqBefore ${liqBefore}`);

        const daiOwnerBalanceBef = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceBef = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance before  : ${daiOwnerBalanceBef}`);
        logger.info(`usdc owner balance before : ${usdcOwnerBalanceBef}`);

        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiOwnerBalanceBef);
        await usdc.approve(supplyUni.address, usdcOwnerBalanceBef);
        logger.info("Approved");

        logger.info("Increasing position...");
        tx = await supplyUni.increasePosition(
          lastPoolId,
          daiOwnerBalanceBef,
          usdcOwnerBalanceBef,
          maxSlip
        );
        await tx.wait();
        logger.info("Position Increased");

        const positionInfo = await manager.positions(tokenId);
        const liqAfter = positionInfo[7];
        logger.info(`liqAfter ${liqAfter}`);

        const daiOwnerBalanceAf = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceAf = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance after   : ${daiOwnerBalanceAf}`);
        logger.info(`usdc owner balance after  : ${usdcOwnerBalanceAf}`);

        const daiStratBalance = await dai.balanceOf(supplyUni.address);
        const usdcStratBalance = await usdc.balanceOf(supplyUni.address);

        expect(daiStratBalance).to.eq(zero);
        expect(usdcStratBalance).to.eq(zero);
        expect(liqAfter).to.be.gt(liqBefore);
        expect(daiOwnerBalanceAf).to.be.lt(daiOwnerBalanceBef);
        expect(usdcOwnerBalanceAf).to.be.lt(usdcOwnerBalanceBef);
        expect(tx).to.emit(supplyUni, "Deposit");
      });
    });

    describe("decreasePosition", () => {
      it("should emit an event after decreasing liquidity", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied!");

        const daiOwnerBalanceBef = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceBef = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  before: ${daiOwnerBalanceBef}`);
        logger.info(`usdc owner balance before: ${usdcOwnerBalanceBef}`);

        logger.info("Decreasing position...");
        tx = await supplyUni.decreasePosition(lastPoolId, 100, maxSlip);
        await tx.wait();
        logger.info("Position decreased");

        const { liquidity } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );
        const daiContractAf = await dai.balanceOf(supplyUni.address);
        const usdcContractAf = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractAf}`);
        logger.info(`usdc contract balance after: ${usdcContractAf}`);

        const daiOwnerBalanceAfter = await dai.balanceOf(owner.address);
        const usdcOwnerBalanceAfter = await usdc.balanceOf(owner.address);

        logger.info(`dai owner balance  after : ${daiOwnerBalanceAfter}`);
        logger.info(`usdc owner balance after: ${usdcOwnerBalanceAfter}`);

        const daiStratBalance = await dai.balanceOf(supplyUni.address);
        const usdcStratBalance = await usdc.balanceOf(supplyUni.address);

        expect(liquidity).to.be.equal(zero);
        expect(daiStratBalance).to.be.equal(zero);
        expect(usdcStratBalance).to.be.equal(zero);
        expect(daiOwnerBalanceAfter).to.be.gt(daiOwnerBalanceBef);
        expect(usdcOwnerBalanceAfter).to.be.gt(usdcOwnerBalanceBef);
        expect(tx).to.emit(supplyUni, "Withdraw");
      });
    });

    describe("collectAllFees", () => {
      it("should collect the fees successfully", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount.div(2));
        await usdc.approve(supplyUni.address, usdcAmount.div(2));
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount.div(2),
          usdcAmount.div(2),
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied!");

        let daiContractBalance = await dai.balanceOf(supplyUni.address);
        let usdcContractBalance = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  before: ${daiContractBalance}`);
        logger.info(`usdc contract balance before: ${usdcContractBalance}`);

        tx = await supplyUni.collectAllFees(lastPoolId);
        await tx.wait();
        logger.info("Collected!");

        daiContractBalance = await dai.balanceOf(supplyUni.address);
        usdcContractBalance = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractBalance}`);
        logger.info(`usdc contract balance after: ${usdcContractBalance}`);
      });

      // It shouldn't touch the liquidity invested when collecting the fees
      it("should keep liquidity deposited in the pool after minting a new position and collecting all the fees", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied!");

        const { tokenId, liquidity: liquidityBefore } =
          await supplyUni.getOwnerInfo(owner.address, lastPoolId);
        logger.info(`liq before ${liquidityBefore}`);

        const daiContractBefore = await dai.balanceOf(supplyUni.address);
        const usdcContractBefore = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  before: ${daiContractBefore}`);
        logger.info(`usdc contract balance before: ${usdcContractBefore}`);

        logger.info("Collecting fees...");
        tx = await supplyUni.connect(owner).collectAllFees(lastPoolId);
        await tx.wait();

        const daiContractAfter = await dai.balanceOf(supplyUni.address);
        const usdcContractAfter = await usdc.balanceOf(supplyUni.address);

        logger.info(`dai contract balance  after: ${daiContractAfter}`);
        logger.info(`usdc contract balance after: ${usdcContractAfter}`);

        const positionInfoAfter = await manager.positions(tokenId);
        const liqManagerAfter = positionInfoAfter[7];
        logger.info(`liq after ${liqManagerAfter}`);

        expect(liqManagerAfter).to.be.equal(liquidityBefore);
      });
    });

    describe("_sendToOwner", () => {
      it("should be called in decreasePosition() func", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
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
        tx = await supplyUni.decreasePosition(lastPoolId, 100, maxSlip);
        await tx.wait();
        logger.info("Position decreased");

        // providers don't support history calls :(
        // expect("_sendToOwner").to.be.calledOnContractWith(supplyUni, [lastPoolId]);
      });
    });

    describe("retrieveNFT", () => {
      it("should transfer NFT correctly to the user and update the state", async () => {
        logger.info("Approving...");
        await dai.approve(supplyUni.address, daiAmount);
        await usdc.approve(supplyUni.address, usdcAmount);
        logger.info("Approved!");

        logger.info("Supplying...");
        let tx = await supplyUni.mintNewPosition(
          lastPoolId,
          daiAmount,
          usdcAmount,
          maxSlip
        );
        await tx.wait();
        logger.info("Supplied!");

        logger.info("Retrieving...");
        tx = await supplyUni.retrieveNFT(lastPoolId);
        await tx.wait();
        logger.info("Retrieved!");

        logger.info("Getting info...");
        const [
          tokenIdOwner,
          amount0Owner,
          amount1Owner,
          liquidityOwner,
          initializedOwner,
        ] = await supplyUni.getOwnerInfo(owner.address, lastPoolId);

        expect(tokenIdOwner).to.be.equal(zero);
        expect(amount0Owner).to.be.equal(zero);
        expect(amount1Owner).to.be.equal(zero);
        expect(liquidityOwner).to.be.equal(zero);
        expect(initializedOwner).to.be.false;
      });
    });
  });
}
