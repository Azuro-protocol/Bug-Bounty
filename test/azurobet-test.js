const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const {
  getRandomConditionId,
  getBlockTime,
  timeShift,
  tokens,
  getTokenId,
  getTokenIdOdds,
  getConditioIdHash,
  tokensDec,
  prepareStand,
} = require("../utils/utils");
const dbg = require("debug")("test:core");

const CONDITION_START = 13253453;
const LIQUIDITY = tokens(2000000);
const LIQUIDITY_PLUS_1 = tokens(2000001);
const LIQUIDITY_ONE_TOKEN = tokens(1);
const ONE_HOUR = 3600;
const ONE_WEEK = 604800;
const TWO_WEEKS = 1209600;
const SCOPE_ID = 1;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const OUTCOMEINCORRECT = 3;
const FEEHALFPERCENT = 5000000;
const FEE1PERCENT = 10000000;
const FEE5PERCENT = 50000000;
const FEE9PERCENT = 90000000;

let conditionArr = [];

const createCondition = async (core, oracle, condID, scopeID, pools, outcomes, time, ipfsHash) => {
  let txCreate = await core
    .connect(oracle)
    .createCondition(condID, scopeID, pools, outcomes, time, ethers.utils.formatBytes32String(ipfsHash));

  let condIDHash = await getConditioIdHash(txCreate);
  conditionArr.push([oracle, condID, condIDHash]);
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

describe("AzuroBet test", function () {
  let owner, adr1, lpOwner, oracle, oracle2, mainteiner;
  let Core, core, core2, Usdt, usdt, LP, lp;
  let now;

  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%

  const URI = "https://smth.com";

  beforeEach(async () => {
    [owner, adr1, lpOwner, oracle, oracle2, mainteiner] = await ethers.getSigners();

    now = await getBlockTime(ethers);

    [core, core2, usdt, lp, azurobet] = await prepareStand(
      ethers,
      owner,
      adr1,
      oracle,
      oracle2,
      mainteiner,
      ONE_WEEK,
      reinforcement,
      marginality,
      LIQUIDITY
    );
  });
  it("Check changing azuroBet", async () => {
    // create new nft contract
    AzuroBet2 = await ethers.getContractFactory("AzuroBet");
    azurobet2 = await upgrades.deployProxy(AzuroBet2);
    await azurobet2.deployed();

    // set new azuroBet2
    await lp.changeAzuroBet(azurobet2.address);
    URI;
  });
  it("Check changing URI", async () => {
    await azurobet.setBaseURI(URI);
    expect(await azurobet.baseURI()).to.be.equal(URI);
  });
  it("Check supportsInterface EIP-165", async () => {
    expect(await azurobet.supportsInterface(0x01ffc9a7)).to.be.equal(true);
  });
});
