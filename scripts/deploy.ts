import { ethers } from "hardhat";

export async function deploy() {
  const supplyUniFactory = await ethers.getContractFactory("SupplyUni");
  const supplyUni = await supplyUniFactory.deploy();

  await supplyUni.deployed();

  console.log("supplyUni deployed to:", supplyUni.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
