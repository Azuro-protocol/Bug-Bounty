const { ethers } = require("hardhat");
const hre = require("hardhat");
const { timeout } = require("../utils/utils");
require("dotenv").config({ path: `.env.upgrade` });

async function main() {
  const [deployer] = await ethers.getSigners();
  const AzuroBetAdr = process.env.UPGRADE_AZUROBET_ADDRESS;
  const use_multisig = process.env.USE_MULTISIG;
  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000 (0x2a)
  // rinkeby => 20000 (0x4)
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const AzuroBet = await ethers.getContractFactory("AzuroBet");

  if (use_multisig != "YES") {
    const upgraded = await upgrades.upgradeProxy(AzuroBetAdr, AzuroBet);
    console.log("upgraded", upgraded.address);
    await timeout(TIME_OUT);
    AzuroBetImplAddress = await upgrades.erc1967.getImplementationAddress(AzuroBetAdr);
    console.log("new AzuroBet deployed to:", AzuroBetImplAddress);
  } else {
    console.log("Preparing proposal...");
    const proposal = await defender.proposeUpgrade(AzuroBetAdr, AzuroBet);
    AzuroBetImplAddress = proposal.metadata.newImplementationAddress;
    console.log("AzuroBet Upgrade proposal created at:", proposal.url, "\nnew implementation", AzuroBetImplAddress);
  }
  await timeout(TIME_OUT);

  const AzuroBetImpl = await AzuroBet.attach(AzuroBetImplAddress);
  await AzuroBetImpl.initialize();

  // verify
  if (chainId == 0x2a || chainId == 0x4) {
    await timeout(TIME_OUT);
    await hre.run("verify:verify", {
      address: AzuroBetImplAddress,
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
