const { BigNumber } = require("@ethersproject/bignumber");

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

const getLPNFTToken = async (txAdd) => {
  let eAdd = (await txAdd.wait()).events.filter((x) => {
    return x.event == "LiquidityAdded";
  });
  return eAdd[0].args["leaf"];
};

const getExpressTokenIdOdds = async (txBet) => {
  let eBet = (await txBet.wait()).events.filter((x) => {
    return x.event == "NewBetExpress";
  });
  return { tokenId: eBet[0].args[1], odds: eBet[0].args[5] };
};

const getConditioIdHash = async (txCreateCondition) => {
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

const prepareEmptyStand = async (ethers, owner, adr1, oracle, oracle2, mainteiner, reinforcement, marginality) => {
  const mintableAmount = tokens(8_000_000);
  // test USDT
  Usdt = await ethers.getContractFactory("TestERC20");
  usdt = await Usdt.deploy();
  await usdt.deployed();
  await usdt.mint(owner.address, mintableAmount);
  await usdt.mint(adr1.address, mintableAmount);

  // nft
  AzuroBet = await ethers.getContractFactory("AzuroBet");
  azurobet = await upgrades.deployProxy(AzuroBet);
  await azurobet.deployed();

  // lp
  LP = await ethers.getContractFactory("LP");
  lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address]);

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

  return [core, core2, usdt, lp, azurobet, math];
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
  [core, core2, usdt, lp, azurobet, math] = await prepareEmptyStand(
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
  await usdt.approve(lp.address, approveAmount);
  await usdt.connect(adr1).approve(lp.address, approveAmount);
  let lpnft = await getLPNFTToken(await lp.addLiquidity(liquidity));

  return [core, core2, usdt, lp, azurobet, math, lpnft];
};

const createCondition = async (core, oracle, condID, pools, outcomes, time, ipfsHash, gameID) => {
  let txCreate = await core
    .connect(oracle)
    .createCondition(condID, pools, outcomes, time, ethers.utils.formatBytes32String(ipfsHash), gameID);

  let condIDHash = await getConditioIdHash(txCreate);
  return condIDHash;
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
  getExpressTokenIdOdds,
  getLPNFTToken,
  getWinthdrawnAmount,
  getConditioIdHash,
  prepareStand,
  prepareEmptyStand,
  createCondition,
  makeBetGetTokenId,
  makeBetGetTokenIdOdds,
  makeExpressBetGetTokenId,
};
