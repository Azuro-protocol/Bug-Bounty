const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");

async function main() {
  const [deployer] = await ethers.getSigners();
  const coreAddr = process.env.COREADDR;
  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000
  // rinkeby => 20000
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  // CORE
  const Core = await ethers.getContractFactory("Core");
  const upgraded = await upgrades.upgradeProxy(coreAddr, Core);
  console.log("upgraded", upgraded.address);
  await timeout(TIME_OUT);
  coreImpl = await upgrades.erc1967.getImplementationAddress(coreAddr);
  console.log("new coreImpl deployed to:", coreImpl);

  await timeout(TIME_OUT);

  // verify
  await hre.run("verify:verify", {
    address: coreImpl,
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
