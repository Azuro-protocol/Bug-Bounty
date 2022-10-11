const { ethers } = require("hardhat");
const hre = require("hardhat");
const { Wallet } = require("ethers");
const { timeout } = require("../utils/utils");
require("dotenv").config({ path: `.env.upgrade` });

async function main() {
  const [deployer] = await ethers.getSigners();
  const lpAdr = process.env.UPGRADE_LP_ADDRESS;
  const use_multisig = process.env.USE_MULTISIG;
  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000 (0x2a)
  // rinkeby => 20000 (0x4)
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : 20000;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const LP = await ethers.getContractFactory("LP");

  if (use_multisig != "YES") {
    const upgraded = await upgrades.upgradeProxy(lpAdr, LP);
    console.log("upgraded", upgraded.address);
    await timeout(TIME_OUT);
    lpImplAddress = await upgrades.erc1967.getImplementationAddress(lpAdr);
    console.log("new lpImpl deployed to:", lpImplAddress);
  } else {
    console.log("Preparing proposal...");
    const proposal = await defender.proposeUpgrade(lpAdr, LP);
    lpImplAddress = proposal.metadata.newImplementationAddress;
    console.log("LP Upgrade proposal created at:", proposal.url, "\nnew implementation", lpImplAddress);
  }
  await timeout(TIME_OUT);

  const lpImpl = await LP.attach(lpImplAddress);
  await lpImpl.initialize(Wallet.createRandom().address, ethers.constants.AddressZero);

  // verify
  if (chainId == 0x2a || chainId == 0x4) {
    await timeout(TIME_OUT);
    await hre.run("verify:verify", {
      address: lpImplAddress,
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
