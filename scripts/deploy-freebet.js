const { ethers, network } = require("hardhat");
const { timeout } = require("../utils/utils");
const { Wallet } = require("ethers");

let wxDaiAddress;

async function main() {
  const chainId = await network.provider.send("eth_chainId");
  // hardhat => 800
  // gnosis => 20000
  const TIME_OUT = chainId == 0x7a69 ? 800 : 20000;
  const [deployer] = await ethers.getSigners();
  const MAINTAINERS = JSON.parse(process.env.MAINTAINERS ?? "[]");

  let freebet;
  const LP_ADDRESS = process.env.LP_ADDRESS;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  // xDAI
  {
    wxDaiAddress = process.env.WXDAI_ADDRESS;
  }

  // Freebet
  {
    const FreeBet = await ethers.getContractFactory("FreeBetV2");
    freebet = await upgrades.deployProxy(FreeBet, [wxDaiAddress]);
    await timeout(TIME_OUT);
    await freebet.deployed();
    console.log("FreeBet deployed to:", freebet.address);
    await timeout(TIME_OUT);
    const freebetImplAddress = await upgrades.erc1967.getImplementationAddress(freebet.address);
    const freebetImpl = FreeBet.attach(freebetImplAddress);
    await freebetImpl.initialize(Wallet.createRandom().address);
    console.log("FreeBetImpl deployed to:", freebetImplAddress);
    await timeout(TIME_OUT);
  }

  // initial settings
  {
    await freebet.setLp(LP_ADDRESS);
    await timeout(TIME_OUT);
    console.log("FreeBet: LP address set to", await freebet.LP());

    for (const maintainer of MAINTAINERS) {
      await freebet.updateMaintainer(maintainer, true);
      console.log("FreeBet: Added maintainer:", maintainer);
      await timeout(TIME_OUT);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
