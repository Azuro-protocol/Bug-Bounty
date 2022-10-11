const { BigNumber } = require("@ethersproject/bignumber");
const { parse } = require("csv-parse");
const fs = require("fs");

function makeid(length) {
  var result = [];
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
  }
  return result.join("");
}

function getRandomConditionId() {
  return Math.random() * 1000000000;
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timeShift(time) {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
}

async function timeShiftBy(ethers, timeDelta) {
  let time = (await getBlockTime(ethers)) + timeDelta;
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
}

async function getBlockTime(ethers) {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  const time = blockBefore.timestamp;
  return time;
}

function tokens(val) {
  return BigNumber.from(val).mul(BigNumber.from("10").pow(18)).toString();
}

function tokensDec(val, dec) {
  return BigNumber.from(val).mul(BigNumber.from("10").pow(dec)).toString();
}

const getTokenId = async (txBet) => {
  let eBet = (await txBet.wait()).events.filter((x) => {
    return x.event == "NewBet";
  });
  return eBet[0].args[1];
};

const getTokenIdOdds = async (txBet) => {
  let eBet = (await txBet.wait()).events.filter((x) => {
    return x.event == "NewBet";
  });
  return { tokenId: eBet[0].args[1], odds: eBet[0].args[5] };
};

const getTokenIdDetails = async (txBet) => {
  const receipt = await txBet.wait();
  let eBet = receipt.events.filter((x) => {
    return x.event == "NewBet";
  });
  const gas = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
  return { tokenId: eBet[0].args.betId, gasUsed: gas, account: eBet[0].args.owner };
};

const getLPNFTToken = async (txAdd) => {
  let eAdd = (await txAdd.wait()).events.filter((x) => {
    return x.event == "LiquidityAdded";
  });
  return eAdd[0].args["leaf"];
};

const getLPNFTTokenDetails = async (txAdd) => {
  const receipt = await txAdd.wait();
  let eAdd = receipt.events.filter((x) => {
    return x.event == "LiquidityAdded";
  });
  const gas = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
  return {
    tokenId: eAdd[0].args["leaf"],
    gasUsed: gas,
    account: eAdd[0].args["account"],
    amount: eAdd[0].args["amount"],
  };
};

const getExpressTokenIdOdds = async (txBet) => {
  let eBet = (await txBet.wait()).events.filter((x) => {
    return x.event == "NewBetExpress";
  });
  return { tokenId: eBet[0].args[1], odds: eBet[0].args[5] };
};

const getConditionIdHash = async (txCreateCondition) => {
  let eCondition = (await txCreateCondition.wait()).events.filter((x) => {
    return x.event == "ConditionCreated";
  });
  return eCondition[0].args.conditionId.toString();
};

const getWinthdrawnAmount = async (tx) => {
  let eWithdraw = (await tx.wait()).events.filter((x) => {
    return x.event == "LiquidityRemoved";
  });
  return eWithdraw[0].args.amount;
};

const getwithdrawPayoutDetails = async (tx) => {
  let receipt = await tx.wait();
  let ePayout = receipt.events.filter((x) => {
    return x.event == "BetterWin";
  });
  let gas = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
  return { amount: ePayout[0].args.amount, gasUsed: gas, account: ePayout[0].args.better };
};

const getwithdrawLiquidityDetails = async (tx) => {
  let receipt = await tx.wait();
  let ePayout = receipt.events.filter((x) => {
    return x.event == "LiquidityRemoved";
  });
  const gas = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
  return {
    tokenId: ePayout[0].args["leaf"],
    gasUsed: gas,
    account: ePayout[0].args["account"],
    amount: ePayout[0].args["amount"],
  };
};

const getShiftDetails = async (txShift) => {
  let eShift = (await txShift.wait()).events.filter((x) => {
    return x.event == "ConditionShifted";
  });
  return { oracleCondId: eShift[0].args[0], conditionId: eShift[0].args[1], newTimestamp: eShift[0].args[2] };
};

const prepareEmptyStand = async (ethers, owner, adr1, oracle, oracle2, mainteiner, reinforcement, marginality) => {
  const mintableAmount = BigNumber.from(tokens(800_000_000_000_000));
  // test wrapped native tokiens xDAI
  WXDAI = await ethers.getContractFactory("WETH9");
  wxDAI = await WXDAI.deploy();

  await wxDAI.deployed();
  await owner.sendTransaction({ to: wxDAI.address, value: mintableAmount });
  await adr1.sendTransaction({ to: wxDAI.address, value: mintableAmount });

  // nft
  AzuroBet = await ethers.getContractFactory("AzuroBet");
  azurobet = await upgrades.deployProxy(AzuroBet);
  await azurobet.deployed();

  // lp
  LP = await ethers.getContractFactory("LP");
  lp = await upgrades.deployProxy(LP, [wxDAI.address, azurobet.address]);

  await lp.deployed();
  await azurobet.setLp(lp.address);

  // Math
  const MathContract = await ethers.getContractFactory("Math");
  math = await upgrades.deployProxy(MathContract);

  Core = await ethers.getContractFactory("Core");
  core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality]);
  await core.deployed();

  core2 = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality]);
  await core2.deployed();

  // setting up
  await core.connect(owner).setLp(lp.address);
  await core.connect(owner).setOracle(oracle2.address);
  await core.connect(owner).addMaintainer(mainteiner.address, true);
  await lp.changeCore(core.address);

  return [core, core2, wxDAI, lp, azurobet, math];
};

const prepareStand = async (
  ethers,
  owner,
  adr1,
  oracle,
  oracle2,
  mainteiner,
  reinforcement,
  marginality,
  liquidity
) => {
  [core, core2, wxDAI, lp, azurobet, math] = await prepareEmptyStand(
    ethers,
    owner,
    adr1,
    oracle,
    oracle2,
    mainteiner,
    reinforcement,
    marginality
  );

  const approveAmount = tokens(999_999_999_999_999);
  await wxDAI.approve(lp.address, approveAmount);
  await wxDAI.connect(adr1).approve(lp.address, approveAmount);
  let lpnft = await getLPNFTToken(await lp.addLiquidity(liquidity));

  return [core, core2, wxDAI, lp, azurobet, math, lpnft];
};

const prepareStandNativeLiquidity = async (
  ethers,
  owner,
  adr1,
  oracle,
  oracle2,
  mainteiner,
  reinforcement,
  marginality,
  liquidity
) => {
  [core, core2, wxDAI, lp, azurobet, math] = await prepareEmptyStand(
    ethers,
    owner,
    adr1,
    oracle,
    oracle2,
    mainteiner,
    reinforcement,
    marginality
  );

  const approveAmount = tokens(999_999_999_999_999);
  let lpnft = await getLPNFTToken(await lp.addLiquidityNative({ value: liquidity }));

  return [core, core2, wxDAI, lp, azurobet, math, lpnft];
};

const getTestCoreOwner = async (hre) => {
  const [owner] = await hre.ethers.getSigners();
  const Core = await ethers.getContractFactory("Core");
  const core = await Core.attach(process.env.CORE_ADDRESS);
  return [core, owner];
};

const createCondition = async (core, oracle, condID, scopeID, pools, outcomes, time, ipfsHashHex) => {
  // TODO this is a ductape to fix a problem with passing real value - added on 5/27/22 by pavelivanov
  if (ipfsHashHex === "ipfs") {
    ipfsHashHex = ethers.utils.formatBytes32String(ipfsHashHex);
  }

  let txCreate = await core.connect(oracle).createCondition(condID, scopeID, pools, outcomes, time, ipfsHashHex);
  let condIDHash = await getConditionIdHash(txCreate);
  return condIDHash;
};

const makeAddLiquidityNative = async (lp, user, amount) => {
  let txAdd = await lp.connect(user).addLiquidityNative({ value: BigNumber.from(amount) });
  let res = await getLPNFTTokenDetails(txAdd);
  return [res.tokenId, res.gasUsed, res.account, res.amount];
};

const makeBetNativeGetTokenId = async (lp, user, condIDHash, betAmount, outcome, deadline, minrate) => {
  let txBet = await lp
    .connect(user)
    .betNative(condIDHash, outcome, deadline, minrate, { value: BigNumber.from(betAmount) });
  let res = await getTokenIdDetails(txBet);
  return [res.tokenId, res.gasUsed, res.account];
};

const makeBetGetTokenId = async (lp, user, condIDHash, betAmount, outcome, deadline, minrate) => {
  let txBet = await lp.connect(user).bet(condIDHash, betAmount, outcome, deadline, minrate);
  let res = await getTokenId(txBet);
  return res;
};

const makeBetGetTokenIdOdds = async (lp, user, condIDHash, betAmount, outcome, deadline, minrate) => {
  let txBet = await lp.connect(user).bet(condIDHash, betAmount, outcome, deadline, minrate);
  let res = await getTokenIdOdds(txBet);
  return { tokenId: res.tokenId, odds: res.odds };
};

const makeExpressBetGetTokenId = async (lp, user, condIDHashList, OutcomeList, OddsList, betAmount, deadline) => {
  let txBet = await lp.connect(user).betExpress(condIDHashList, OutcomeList, OddsList, betAmount, deadline);
  let res = await getExpressTokenIdOdds(txBet);
  return res.tokenId;
};

const makeBetForGetTokenIdDetails = async (lp, user, userFor, condIDHash, betAmount, outcome, deadline, minrate) => {
  let txBet = await lp.connect(user).betFor(userFor.address, condIDHash, betAmount, outcome, deadline, minrate);
  let res = await getTokenIdDetails(txBet);
  return res;
};

const makeCondition = async (ethers, lp, core, oracle, condId, gameId, period, win_loss) => {
  const pool1 = 5000000;
  const pool2 = 5000000;
  time = await getBlockTime(ethers);
  let condIDHash = await createCondition(core, oracle, condId, gameId, [pool2, pool1], win_loss, time + period, "ipfs");
  return condIDHash;
};

const makeConditionWinBetResolve = async (ethers, lp, core, oracle, bettor, condId, gameId, win_loss, amount) => {
  const ONE_DAY = 86400;
  const ONE_MINUTE = 60;
  let condIDHash = makeCondition(ethers, lp, core, oracle, condId, gameId, ONE_DAY, win_loss);
  time = await getBlockTime(ethers);
  let betTx = await makeBetGetTokenIdOdds(lp, bettor, condIDHash, amount, win_loss[0], time + 1000, 0);
  await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
  await core.connect(oracle).resolveCondition(condId, win_loss[0]);
  await makeWithdrawPayout(lp, bettor, betTx.tokenId);
};

const makeConditionLossBet = async (ethers, lp, core, oracle, bettor, condId, gameId, win_loss, amount) => {
  const ONE_DAY = 86400;
  const ONE_MINUTE = 60;
  let condIDHash = makeCondition(ethers, lp, core, oracle, condId, gameId, ONE_DAY, win_loss);
  time = await getBlockTime(ethers);
  await makeBetGetTokenIdOdds(lp, bettor, condIDHash, amount, win_loss[1], time + 1000, 0);
  await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
  await core.connect(oracle).resolveCondition(condId, win_loss[0]);
};

const getLiquidityCorrectness = async (lp, token) => {
  let reserve = await lp.getReserve();
  let daoRewards = await lp.realDaoRewards();
  let oracleRewards = await lp.realOracleRewards();
  let balance = await token.balanceOf(lp.address);
  return {
    check: reserve
      .add(daoRewards < 0 ? 0 : daoRewards)
      .add(oracleRewards < 0 ? 0 : oracleRewards)
      .sub(balance),
    reserve: reserve,
    daoRewards: daoRewards,
    oracleRewards: oracleRewards,
    balance: balance,
  };
};

const getMarginReinforcement = async (path_to_file) => {
  const reinforcements = [];
  const margins = [];
  let existence = fs.existsSync(path_to_file);
  if (!existence) {
    console.log("file ", path_to_file, "not found");
    return [reinforcements, margins];
  }

  const file = fs.createReadStream(path_to_file);
  const parser = file.pipe(
    parse({
      columns: false,
      // CSV options if any
    })
  );
  for await (const record of parser) {
    // Work with each record
    // Outcome - Reinforcement (10^18)
    reinforcements.push(record[0], record[2]);
    // Outcome - Margin (10^9)
    margins.push(record[0], record[4]);
  }
  parser.destroy();
  // remove columns headers
  reinforcements.splice(0, 2);
  margins.splice(0, 2);
  return [reinforcements, margins];
};

const makeWithdrawPayout = async (lp, user, tokenId) => {
  let txPayOut = await lp.connect(user).withdrawPayout(tokenId);
  let res = await getwithdrawPayoutDetails(txPayOut);
  return [res.amount, res.gasUsed, res.account];
};

const makeWithdrawLiquidityNative = async (lp, user, lpnft, percent) => {
  let txWithdraw = await lp.connect(user).withdrawLiquidityNative(lpnft, percent);
  let res = await getwithdrawLiquidityDetails(txWithdraw);
  return [res.amount, res.gasUsed, res.account];
};

const makeWithdrawPayoutNative = async (lp, user, tokenId) => {
  let txPayOut = await lp.connect(user).withdrawPayoutNative(tokenId);
  let res = await getwithdrawPayoutDetails(txPayOut);
  return [res.amount, res.gasUsed, res.account];
};

module.exports = {
  makeid,
  timeout,
  getBlockTime,
  timeShift,
  timeShiftBy,
  tokens,
  tokensDec,
  getTokenId,
  getTokenIdOdds,
  getTokenIdDetails,
  getExpressTokenIdOdds,
  getwithdrawLiquidityDetails,
  getwithdrawPayoutDetails,
  getLPNFTToken,
  getWinthdrawnAmount,
  getwithdrawPayoutDetails,
  getLPNFTTokenDetails,
  getShiftDetails,
  getConditionIdHash,
  getTestCoreOwner,
  getLiquidityCorrectness,
  prepareStand,
  prepareStandNativeLiquidity,
  prepareEmptyStand,
  createCondition,
  makeAddLiquidityNative,
  makeBetNativeGetTokenId,
  makeBetGetTokenId,
  makeBetGetTokenIdOdds,
  makeExpressBetGetTokenId,
  makeBetForGetTokenIdDetails,
  makeConditionWinBetResolve,
  makeConditionLossBet,
  makeCondition,
  getMarginReinforcement,
  makeWithdrawPayoutNative,
  makeWithdrawLiquidityNative,
  makeWithdrawPayout,
};
