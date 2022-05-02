const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");

async function main() {
  const [deployer] = await ethers.getSigners();
  const oracle = deployer;
  const AzuroBetAdr = "0x0abDDE07AB026d7eD41eD2Cc665C8B8AbaE1e365"; // 5%
  const chainId = await hre.network.provider.send("eth_chainId");
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  // AzuroBet
  const AzuroBet = await ethers.getContractFactory("AzuroBet");
  const upgraded = await upgrades.upgradeProxy(AzuroBetAdr, AzuroBet);
  console.log("upgraded", upgraded.address);
  await timeout(TIME_OUT);
  AzuroBetImpl = await upgrades.erc1967.getImplementationAddress(AzuroBetAdr);
  console.log("new AzuroBet deployed to:", AzuroBetImpl);

  await timeout(TIME_OUT);

  // verify
  await hre.run("verify:verify", {
    address: AzuroBetImpl,
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
