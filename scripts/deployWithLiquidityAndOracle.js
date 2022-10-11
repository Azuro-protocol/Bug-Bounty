const { BigNumber } = require("@ethersproject/bignumber");
const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const { tokens, timeout, getBlockTime, getLPNFTTokenDetails } = require("../utils/utils");

const reinforcement = tokens(20_000);
const marginality = 50000000; // 5%
const ORACLES = JSON.parse(process.env.ORACLES);
let MAINTAINERS = JSON.parse(process.env.MAINTAINERS);
const E2E_ACCOUNT = process.env.E2E_ACCOUNT;

async function main() {
  const [deployer] = await ethers.getSigners();
  const oracle = deployer;

  let wxDAI, azurobet, lp, core, coreImplAddress, azurobetImplAddress, lpImplAddress;

  console.log("Deployer wallet:", deployer.address);
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const chainId = await hre.network.provider.send("eth_chainId");
  // hardhat => 800
  // kovan => 8000
  // rinkeby => 20000
  // sokol => 10000 (0x4D)
  const TIME_OUT = chainId == 0x7a69 ? 800 : chainId == 0x2a ? 8000 : chainId == 0x4d ? 25000 : 20000;
  if (chainId == 0x7a69 || chainId == 0x4d) {
    MAINTAINERS.push(deployer.address);
  }

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
    azurobetImplAddress = await upgrades.erc1967.getImplementationAddress(azurobet.address);
    const azurobetImpl = await AzuroBet.attach(azurobetImplAddress);
    await azurobetImpl.initialize();
    console.log("azurobetImpl deployed to:", azurobetImplAddress);
    await timeout(TIME_OUT);
  }

  // LP
  {
    const LP = await ethers.getContractFactory("LP");
    lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address]);
    await lp.deployed();
    await timeout(TIME_OUT);
    lpImplAddress = await upgrades.erc1967.getImplementationAddress(lp.address);
    const lpImpl = await LP.attach(lpImplAddress);
    await lpImpl.initialize(usdt.address, azurobet.address);
    console.log("lpImpl deployed to:", lpImplAddress);
    await timeout(TIME_OUT);
  }

  // CORE
  {
    const Core = await ethers.getContractFactory("Core");
    core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality]);
    await core.deployed();
    await timeout(TIME_OUT);
    coreImplAddress = await upgrades.erc1967.getImplementationAddress(core.address);
    const coreImpl = await Core.attach(coreImplAddress);
    await coreImpl.initialize(reinforcement, oracle.address, marginality);
    console.log("coreImpl deployed to:", coreImplAddress);
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
    console.log("Approve done", approveAmount.toString());

    const liquidity = tokens(600_000_000);

    let txAdd = await lp.addLiquidity(liquidity);
    await timeout(TIME_OUT);
    let res = await getLPNFTTokenDetails(txAdd);
    await timeout(TIME_OUT);
    console.log("LP tokens supply", (await lp.totalSupply()).toString(), "nft", res.tokenId.toString());

    if (E2E_ACCOUNT) {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [E2E_ACCOUNT],
      });
      const e2eAccount = await ethers.provider.getSigner(E2E_ACCOUNT);

      await deployer.sendTransaction({ to: E2E_ACCOUNT, value: ethers.utils.parseEther("10000") });
      console.log("e2e account native token balance:", (await e2eAccount.getBalance()).toString());

      await usdt.mint(E2E_ACCOUNT, tokens(800_000_000));
      console.log("e2e account balance:", await usdt.balanceOf(E2E_ACCOUNT));

      await usdt.connect(e2eAccount).approve(lp.address, approveAmount);
      console.log("e2e account approve done", approveAmount.toString());
    }

    time = await getBlockTime(ethers);

    console.log("\nSUMMARY:");
    console.log("CORE:", core.address);
    console.log("LP:", lp.address);
    console.log("AZURO_BET:", azurobet.address);
    console.log("USDT:", usdt.address);

    console.log(
      "CONTRACTS FOR WEB APP:",
      JSON.stringify({
        core: core.address,
        lp: lp.address,
        azuroBet: azurobet.address,
        token: usdt.address,
      })
    );

    for (const iterator of MAINTAINERS.keys()) {
      await core.addMaintainer(MAINTAINERS[iterator], true);
      await timeout(TIME_OUT);
    }

    console.log("MAINTAINERS", MAINTAINERS);
    await timeout(TIME_OUT);

    for (const iterator of ORACLES.keys()) {
      await core.setOracle(ORACLES[iterator]);
      await timeout(TIME_OUT);
    }
    console.log("ORACLES", ORACLES);
  }

  //verification
  if (chainId != 0x7a69) {
    await hre.run("verify:verify", {
      address: azurobetImplAddress,
      constructorArguments: [],
    });
    await hre.run("verify:verify", {
      address: coreImplAddress,
      constructorArguments: [],
    });
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
