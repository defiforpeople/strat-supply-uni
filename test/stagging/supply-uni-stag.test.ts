import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, network } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, ContractTransaction } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SupplyUni, IERC20 } from "../../typechain-types";
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

const { TOKEN0_ADDRESS, TOKEN1_ADDRESS, CONTRACT_ADDRESS, POOL_FEE } =
  process.env;
const GAS_LIMIT = BigNumber.from("2074000");
const gas = { gasLimit: GAS_LIMIT };

if (network.name === ("hardhat" || "localhost")) {
  describe.skip;
} else {
  logger.info("Stagging test of SupplyUni!");

  describe("supplyUni", () => {
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let token0: IERC20;
    let token1: IERC20;
    let amount: BigNumber;
    let supplyUni: SupplyUni;
    let lastPoolId: BigNumber;
    let poolFee: BigNumber;
    let maxSlip: BigNumber;
    let zero: BigNumber;

    beforeEach(async () => {
      // define a zero variable
      zero = BigNumber.from(0);

      // get wallets
      [owner, user] = await ethers.getSigners();

      // get SupplyUni strategy contract
      supplyUni = await ethers.getContractAt(
        "SupplyUni",
        `${CONTRACT_ADDRESS}`
      );

      // get tokens
      token0 = await ethers.getContractAt("IERC20", `${TOKEN0_ADDRESS}`);
      token1 = await ethers.getContractAt("IERC20", `${TOKEN1_ADDRESS}`);

      // fee of the pool
      poolFee = BigNumber.from(`${POOL_FEE}`);

      // if there is no pool created, create one
      let recentlyCreated = false;
      lastPoolId = (await supplyUni.connect(owner).poolCount()).sub(1);
      if (lastPoolId.lt(zero)) {
        await addPool(
          supplyUni.address,
          token0.address,
          token1.address,
          poolFee
        );
        lastPoolId = lastPoolId.add(1);
        recentlyCreated = true;
      }

      // if a pool hasn't been recentrly created, check if is the same we want to add
      if (!recentlyCreated) {
        // get pool
        const pool = await supplyUni.getPool(lastPoolId);

        // compare if the pool is already initialized
        const initialized = true;
        const lastPool = [token0.address, token1.address, poolFee, initialized];

        // create the pool if is not initialized yet with the params we set
        if (pool.toString() !== lastPool.toString()) {
          await addPool(
            supplyUni.address,
            token0.address,
            token1.address,
            poolFee
          );
          lastPoolId = lastPoolId.add(1);
        }
      }
      logger.info(`lastPoolId ${lastPoolId}`);

      // set a high slip because in testnets the pools are very imbalanced
      maxSlip = BigNumber.from(100);
    });

    describe("test all the functions with a single user", () => {
      it.only("should do all with 1 signer", async () => {
        // define tx var
        let tx: ContractTransaction;

        // get owner gas balance and print
        const ownerBalance = await ethers.provider.getBalance(owner.address);
        logger.info(`start gas owner balance  : ${ownerBalance}`);

        // get owner token balances at the beggining
        const token0OwnerBalanceStart = await token0.balanceOf(owner.address);
        const token1OwnerBalanceStart = await token1.balanceOf(owner.address);
        logger.info(`Star token0 owner balance: ${token0OwnerBalanceStart}`);
        logger.info(`Star token1 owner balance: ${token1OwnerBalanceStart}`);

        const mintOwnerAmm = token0OwnerBalanceStart
          .div(2)
          .gt(token1OwnerBalanceStart.div(2))
          ? token1OwnerBalanceStart.div(2)
          : token0OwnerBalanceStart.div(2);
        // get amount (same quantity for a 50/50 amount distribution of tokens in the position)
        logger.info(`mintOwnerAmm                  : ${mintOwnerAmm}`);

        let { tokenId: ownerMintId } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        // if there is no position yet, mint it
        if (ownerMintId.eq(zero)) {
          // mint new position owner
          logger.info("Minting new position owner...");
          tx = await mintNewPosition(
            supplyUni.address,
            lastPoolId,
            owner.address,
            token0.address,
            token1.address,
            mintOwnerAmm,
            mintOwnerAmm,
            maxSlip
          );

          const { tokenId } = await supplyUni.getOwnerInfo(
            owner.address,
            lastPoolId
          );
          ownerMintId = tokenId;
        }

        logger.info(`owner tokenId: ${ownerMintId}`);
        const balance0AfterMint = await token0.balanceOf(owner.address);
        const balance1AfterMint = await token1.balanceOf(owner.address);

        // collect fees
        logger.info("Collecting fees owner...");
        tx = await collectAllFees(supplyUni.address, lastPoolId, owner.address);
        logger.info("Collected!");

        // increase position
        const token0OwnerIncrease = balance0AfterMint.div(5);
        const token1OwnerIncrease = balance1AfterMint.div(5);

        const ammOwnerIncrease = token0OwnerIncrease.gt(token1OwnerIncrease)
          ? token1OwnerIncrease
          : token0OwnerIncrease;

        logger.info(`ammOwnerIncrease ${ammOwnerIncrease}`);

        logger.info(`increasing position owner...`);
        tx = await increasePosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          token0.address,
          token1.address,
          ammOwnerIncrease,
          ammOwnerIncrease,
          maxSlip
        );

        // assertions
        let token0StratBalance = await token0.balanceOf(supplyUni.address);
        let token1StratBalance = await token1.balanceOf(supplyUni.address);
        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);

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
        // get the liquidity after decreasing 100% (should be 0 or less than gas limit)
        const { liquidity: liqOwnerFinal } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        // retrieve nft of position
        logger.info("Retrieving NFT...");
        tx = await retrieveNFT(supplyUni.address, lastPoolId, owner.address);
        logger.info("Retrieved NFT!");
        // getting tokenId after retrieving position (shouldn't exists so should be 0)
        const { tokenId: ownerId } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        // assertions
        token0StratBalance = await token1.balanceOf(supplyUni.address);
        token1StratBalance = await token1.balanceOf(supplyUni.address);

        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);
        expect(liqOwnerFinal).to.be.lt(GAS_LIMIT);
        expect(ownerId).to.be.equal(zero);
        logger.info("Done");
      });
    });

    describe("multiple users doing multiple tx with the contract should be possible", () => {
      it("should mint 2 new positions from different users, increase both, decrease and collect both correctly", async () => {
        const zero = BigNumber.from(0);
        let tx: ContractTransaction;

        logger.info(
          `user gas balance: ${await ethers.provider.getBalance(user.address)}`
        );

        // get token balances
        const token0OwnerBalanceStart = await token0.balanceOf(owner.address);
        const token1OwnerBalanceStart = await token1.balanceOf(owner.address);

        const token0UserBalanceStart = await token0.balanceOf(user.address);
        const token1UserBalanceStart = await token1.balanceOf(user.address);

        logger.info(`token0 user balance  at start: ${token0UserBalanceStart}`);
        logger.info(`token1 user balance at start: ${token1UserBalanceStart}`);

        // mint new position user

        let { tokenId: ownerMintId } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        // if there is no position yet, mint it
        if (ownerMintId.eq(zero)) {
          // get amount for minting the same amount of both tokens
          const mintOwnerAmm = token0OwnerBalanceStart
            .div(2)
            .gt(token1OwnerBalanceStart.div(2))
            ? token1OwnerBalanceStart.div(2)
            : token0OwnerBalanceStart.div(2);
          // mint new position owner
          logger.info("Minting new position owner...");
          tx = await mintNewPosition(
            supplyUni.address,
            lastPoolId,
            owner.address,
            token0.address,
            token1.address,
            mintOwnerAmm,
            mintOwnerAmm,
            maxSlip
          );

          const { tokenId } = await supplyUni.getOwnerInfo(
            owner.address,
            lastPoolId
          );
          ownerMintId = tokenId;
        }

        logger.info(`owner tokenId: ${ownerMintId}`);

        // mint new position user

        let { tokenId: userMintId } = await supplyUni.getOwnerInfo(
          user.address,
          lastPoolId
        );

        // if there is no position yet, mint it
        if (userMintId.eq(zero)) {
          // get amount for minting the same amount of both tokens
          const mintUserAmm = token0UserBalanceStart
            .div(2)
            .gt(token1UserBalanceStart.div(2))
            ? token1UserBalanceStart.div(2)
            : token0UserBalanceStart.div(2);

          logger.info("Minting new position user...");
          tx = await mintNewPosition(
            supplyUni.address,
            lastPoolId,
            user.address,
            token0.address,
            token1.address,
            mintUserAmm,
            mintUserAmm,
            maxSlip
          );

          const { tokenId } = await supplyUni.getOwnerInfo(
            user.address,
            lastPoolId
          );
          userMintId = tokenId;
        }
        logger.info(`user tokenId: ${userMintId}`);

        // get balances after minting position
        const token0OwnerBalanceMint = await token0.balanceOf(owner.address);
        const token1OwnerBalanceMint = await token1.balanceOf(owner.address);

        const token0UserBalanceMint = await token0.balanceOf(user.address);
        const token1UserBalanceMint = await token1.balanceOf(user.address);

        logger.info(`token0owner balance post mint: ${token0OwnerBalanceMint}`);
        logger.info(`token1owner balance post mint: ${token1OwnerBalanceMint}`);

        logger.info(`token0user balance post mint: ${token0UserBalanceMint}`);
        logger.info(`token1user balance post mint: ${token1UserBalanceMint}`);

        // assert that the contract doesn't have any token amount
        let token0StratBalance = await token0.balanceOf(supplyUni.address);
        let token1StratBalance = await token1.balanceOf(supplyUni.address);
        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);

        // owner increase position
        // get amounts for increasing with the same amount for both assets
        const token0OwnerIncrease = token0OwnerBalanceMint.div(2);
        const token1OwnerIncrease = token1OwnerBalanceMint.div(2);
        const ammOwnerIncrease = token0OwnerIncrease.gt(token1OwnerIncrease)
          ? token1OwnerIncrease
          : token0OwnerIncrease;
        logger.info(`ammOwnerIncrease ${ammOwnerIncrease}`);

        logger.info(`increasing position owner...`);
        const incrTx0 = await increasePosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          token0.address,
          token1.address,
          ammOwnerIncrease,
          ammOwnerIncrease,
          maxSlip
        );

        // user increase position
        // get amounts for increasing with the same amount for both assets
        const token0UserIncrease = token0UserBalanceMint.div(2);
        const token1UserIncrease = token1UserBalanceMint.div(2);
        const ammUserIncrease = token0UserIncrease.gt(token1UserIncrease)
          ? token1UserIncrease
          : token0UserIncrease;
        logger.info(`ammUserIncrease: ${ammUserIncrease}`);

        logger.info(`increasing position user...`);
        const incrTx1 = await increasePosition(
          supplyUni.address,
          lastPoolId,
          user.address,
          token0.address,
          token1.address,
          ammUserIncrease,
          ammUserIncrease,
          maxSlip
        );

        // assert the SupplyUni contract doesn't have any token amount
        token0StratBalance = await token0.balanceOf(supplyUni.address);
        token1StratBalance = await token1.balanceOf(supplyUni.address);
        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);

        // decrease position owner
        const decrOwnerPerc = BigNumber.from(100);
        logger.info("Decreasing position owner...");
        const withdrTx0 = await decreasePosition(
          supplyUni.address,
          lastPoolId,
          owner.address,
          decrOwnerPerc,
          maxSlip
        );

        // decrease position user
        const decrUserPerc = BigNumber.from(100);
        logger.info("Decreasing position user...");
        const withdrTx1 = await decreasePosition(
          supplyUni.address,
          lastPoolId,
          user.address,
          decrUserPerc,
          maxSlip
        );

        // get liquidity amounts after decreasing
        const { liquidity: liqOwnerAfter } = await supplyUni.getOwnerInfo(
          owner.address,
          lastPoolId
        );

        const { liquidity: liqUserAfter } = await supplyUni.getOwnerInfo(
          user.address,
          lastPoolId
        );

        // assert the SupplyUni contract doesn't have any token amount
        token0StratBalance = await token0.balanceOf(supplyUni.address);
        token1StratBalance = await token1.balanceOf(supplyUni.address);
        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);

        // get balances for the last logs and assertions
        const token0OwnerBalanceFinal = await token0.balanceOf(owner.address);
        const token1OwnerBalanceFinal = await token1.balanceOf(owner.address);
        logger.info(`token0 owner balance  final : ${token0OwnerBalanceFinal}`);
        logger.info(`token1 owner balance final: ${token1OwnerBalanceFinal}`);
        logger.info(`owner liq ${liqOwnerAfter}`);

        const token0UserBalanceFinal = await token0.balanceOf(user.address);
        const token1UserBalanceFinal = await token1.balanceOf(user.address);
        logger.info(`token0 user balance  final : ${token0UserBalanceFinal}`);
        logger.info(`token1 user balance final: ${token1UserBalanceFinal}`);
        logger.info(`User liq ${liqUserAfter}`);

        logger.info("Retreiving owner NFT");
        tx = await supplyUni.connect(owner).retrieveNFT(lastPoolId, gas);
        await tx.wait();

        logger.info("Retreiving user NFT");
        tx = await supplyUni.connect(user).retrieveNFT(lastPoolId, gas);
        await tx.wait();

        // get SupplyUni contract token amounts
        token0StratBalance = await token0.balanceOf(supplyUni.address);
        token1StratBalance = await token1.balanceOf(supplyUni.address);
        logger.info(`contract token0 balance  final ${token0StratBalance}`);
        logger.info(`contract token1 balance final ${token1StratBalance}`);

        // final assertions
        expect(token0StratBalance).to.be.equal(zero);
        expect(token1StratBalance).to.be.equal(zero);
        expect(liqOwnerAfter).to.be.equal(zero);
        expect(liqUserAfter).to.be.equal(zero);
        expect(token0OwnerBalanceFinal).to.be.gt(token0OwnerBalanceMint);
        expect(token1OwnerBalanceFinal).to.be.gt(token1OwnerBalanceMint);
        expect(token1UserBalanceFinal).to.be.gt(token1UserBalanceMint);
        expect(token0UserBalanceFinal).to.be.gt(token0UserBalanceMint);
        expect(incrTx0).to.emit(supplyUni, "Deposit");
        expect(incrTx1).to.emit(supplyUni, "Deposit");
        expect(withdrTx0).to.emit(supplyUni, "Withdraw");
        expect(withdrTx1).to.emit(supplyUni, "Withdraw");
        logger.info("Done");
      });
    });
  });
}
