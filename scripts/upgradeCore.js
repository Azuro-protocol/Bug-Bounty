const { ethers } = require("hardhat");
const hre = require("hardhat");
const { timeout } = require("../utils/utils");
require("dotenv").config({ path: `.env.upgrade` });

async function main() {
  const [deployer] = await ethers.getSigners();
  const coreAddr = process.env.UPGRADE_CORE_ADDRESS;
  const use_multisig = process.env.USE_MULTISIG;
  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000 (0x2a)
  // rinkeby => 20000 (0x4)
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const Core = await ethers.getContractFactory("Core");

  if (use_multisig != "YES") {
    const upgraded = await upgrades.upgradeProxy(coreAddr, Core);
    console.log("upgraded", upgraded.address);
    await timeout(TIME_OUT);
    coreImplAddress = await upgrades.erc1967.getImplementationAddress(coreAddr);
    console.log("new coreImpl deployed to:", coreImplAddress);
  } else {
    console.log("Preparing proposal...");
    const proposal = await defender.proposeUpgrade(coreAddr, Core);
    coreImplAddress = proposal.metadata.newImplementationAddress;
    console.log("Core Upgrade proposal created at:", proposal.url, "\nnew implementation", coreImplAddress);
  }
  await timeout(TIME_OUT);

  const coreImpl = await Core.attach(coreImplAddress);
  await coreImpl.initialize(0, ethers.constants.AddressZero, 0);

  // verify
  if (chainId == 0x2a || chainId == 0x4) {
    await timeout(TIME_OUT);
    await hre.run("verify:verify", {
      address: coreImplAddress,
      constructorArguments: [],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
