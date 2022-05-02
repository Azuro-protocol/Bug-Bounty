const { ethers } = require("hardhat");
const hre = require("hardhat");
const { tokens, timeout, getBlockTime } = require("../utils/utils");

const reinforcement = tokens(20_000);
const marginality = 50000000; // 5%
const MAINTEINERS = ["0x0D62B886234EA4dC9bd86FaB239578DcD0075fb0", "0x628d2714F912aaB37e00304B5fF0283BE7DFf75f"];
const ORACLES = [
  "0x0D62B886234EA4dC9bd86FaB239578DcD0075fb0",
  "0x2c33fEe397eEA9a3573A31a2Ea926424E35584a1",
  "0x628d2714F912aaB37e00304B5fF0283BE7DFf75f",
  "0x834DD1699F7ed641b8FED8A57D1ad48A9B6Adb4E",
];

let TEST_WALLET = [];
TEST_WALLET.push(process.env.TEST_WALLET1);
TEST_WALLET.push(process.env.TEST_WALLET2);
TEST_WALLET.push(process.env.TEST_WALLET3);

async function main() {
  const [deployer] = await ethers.getSigners();
  const oracle = deployer;

  let usdt, azurobet, lp, core, coreImpl, azurobetImpl, lpImpl;

  console.log("Deployer wallet: ", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000
  // rinkeby => 20000
  // sokol => 10000 (0x4D)
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : chainId == 0x4d ? 10000 : 20000;

  // USDT
  {
    const Usdt = await ethers.getContractFactory("TestERC20");
    usdt = await Usdt.deploy();
    await usdt.deployed();
    await timeout(TIME_OUT);
    console.log("usdt deployed to:", usdt.address);
    await usdt.mint(deployer.address, tokens(800_000_000));
    await timeout(TIME_OUT);
  }

  // NFT
  {
    const AzuroBet = await ethers.getContractFactory("AzuroBet");
    azurobet = await upgrades.deployProxy(AzuroBet);
    await timeout(TIME_OUT);
    await azurobet.deployed();
    await timeout(TIME_OUT);
    azurobetImpl = await upgrades.erc1967.getImplementationAddress(azurobet.address);
    console.log("azurobetImpl deployed to:", azurobetImpl);
    await timeout(TIME_OUT);
  }

  // LP
  {
    const LP = await ethers.getContractFactory("LP");
    lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address]);
    await lp.deployed();
    await timeout(TIME_OUT);
    lpImpl = await upgrades.erc1967.getImplementationAddress(lp.address);
    console.log("lpImpl deployed to:", lpImpl);
    await timeout(TIME_OUT);
  }

  // CORE
  {
    const Core = await ethers.getContractFactory("Core");
    core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality]);
    await core.deployed();
    await timeout(TIME_OUT);
    coreImpl = await upgrades.erc1967.getImplementationAddress(core.address);
    console.log("coreImpl deployed to:", coreImpl);
    await timeout(TIME_OUT);
  }

  // settings
  {
    await core.setLp(lp.address);
    await timeout(TIME_OUT);
    console.log("CORE: LP address set to", await core.LP());

    await lp.changeCore(core.address);
    await timeout(TIME_OUT);
    console.log("LP: core address set to", await lp.core());

    await azurobet.setLp(lp.address);
    await timeout(TIME_OUT);
    console.log("azurobet: LP address set to", await azurobet.lpAddress());

    const approveAmount = tokens(999_999_999);
    await usdt.approve(lp.address, approveAmount);
    await timeout(TIME_OUT);
    console.log("Approve done ", approveAmount.toString());

    const liquidity = tokens(600_000_000);
    await lp.addLiquidity(liquidity, { gasLimit: 1300000 }); // in tests max 1154635
    await timeout(TIME_OUT);
    console.log("LP tokens supply", (await lp.totalSupply()).toString());

    time = await getBlockTime(ethers);

    console.log("NEXT_PUBLIC_CORE = ", core.address);
    console.log("NEXT_PUBLIC_LP = ", lp.address);
    console.log("NEXT_PUBLIC_AZURO_BET = ", azurobet.address);
    console.log("NEXT_PUBLIC_USDT = ", usdt.address);

    for (const iterator of Array(3).keys()) {
      await usdt.transfer(TEST_WALLET[iterator], tokens(10_000_000));
      await timeout(TIME_OUT);
      console.log("10_000_000 usdt sent to %s", TEST_WALLET[iterator]);
    }

    for (const iterator of MAINTEINERS.keys()) {
      await core.addMaintainer(MAINTEINERS[iterator], true);
      await timeout(TIME_OUT);
    }
    console.log("MAINTEINERS", MAINTEINERS);

    for (const iterator of ORACLES.keys()) {
      await core.setOracle(ORACLES[iterator]);
      await timeout(TIME_OUT);
    }
    console.log("ORACLES", ORACLES);
  }

  //verification
  if (chainId != 0x7a69) {
    await hre.run("verify:verify", {
      address: azurobetImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: coreImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: lpImpl,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: usdt.address,
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
