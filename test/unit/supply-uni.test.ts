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

      const daiOwnerBalance = await dai.balanceOf(owner.address);
      const usdcOwnerBalance = await usdc.balanceOf(owner.address);
      logger.info(`dai owner balance before: ${daiOwnerBalance}`);
      logger.info(`usdc owner balance before: ${usdcOwnerBalance}`);
    });

    describe("addPool", () => {
      it("should initialize the pool correctly with the 0 id", async () => {
        const lastId = (await supplyUni.poolCount()).sub(1);
        const {
          token0,
          token1,
          poolFee: poolFeeContract,
          isActive,
        } = await supplyUni.getPool(BigNumber.from(lastId));

        expect(token0).to.eq(dai.address);
        expect(token1).to.eq(usdc.address);
        expect(poolFeeContract).to.eq(poolFee);
        expect(isActive).to.be.true;
      });
    });

    describe.only("mintNewPosition", () => {
      it("Should mint a new position correctly", async () => {
        const lastId = (await supplyUni.poolCount()).sub(1);

        logger.info("Transferring...");
        await dai.connect(owner).approve(supplyUni.address, daiAmount);
        await usdc.connect(owner).approve(supplyUni.address, usdcAmount);
        logger.info("Transferred!");

        logger.info("Supplying...");
        const tx = await supplyUni
          .connect(owner)
          .mintNewPosition(lastId, daiAmount, usdcAmount);

        expect(tx).to.emit(supplyUni, "Deposit");
      });
    });
  });
}
