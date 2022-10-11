const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const {
  getRandomConditionId,
  prepareStand,
  tokens,
  getBlockTime,
  createCondition,
  makeBetGetTokenId,
  timeShiftBy,
} = require("../utils/utils");
const dbg = require("debug")("test:math");

const OUTCOMEWIN_INDEX = 0;
const OUTCOMEWIN = 0;
const OUTCOMELOSS = 1;
const ONE_WEEK = 604800;
const LIQUIDITY = tokens(1000);

describe("Math test", function () {
  let owner, adr1, lpOwner, oracle, oracle2, maintainer;
  let Core, core, Usdt, wxDAI, LP, lp;

  const reinforcement = tokens(200); // 10%
  const marginality = 50000000; // 5%

  const odds1 = 5000000;
  const odds2 = 5000000;

  before(async () => {
    [owner, adr1, lpOwner, oracle, oracle2, maintainer] = await ethers.getSigners();

    [core, core2, wxDAI, lp] = await prepareStand(
      ethers,
      owner,
      adr1,
      oracle,
      oracle2,
      maintainer,
      reinforcement,
      marginality,
      LIQUIDITY
    );

    // setting up
    await core.connect(owner).setLp(lp.address);
    await lp.changeCore(core.address);
    const approveAmount = constants.WeiPerEther.mul(9999999);

    await wxDAI.approve(lp.address, approveAmount);
    dbg("Approve done ", approveAmount);

    const liquidity = constants.WeiPerEther.mul(2000000);
    await lp.addLiquidity(liquidity);
  });

  it("Should calculate margin", async function () {
    var a = await core.marginAdjustedOdds(1730000000, 50000000, 1e9);
    dbg("1.73 with 5% newOdds = ", utils.formatUnits(a, 9));
    expect(a).to.equal(1658829423);

    a = await core.marginAdjustedOdds(1980000000, 50000000, 1e9);
    dbg("1.98 with 5% newOdds = ", utils.formatUnits(a, 9));
    expect(a).to.equal(1886657619);

    a = await core.marginAdjustedOdds(1980000000, 100000000, 1e9);
    dbg("1.98 with 10% newOdds = ", utils.formatUnits(a, 9));
    expect(a).to.equal(1801801818);
  });

  it("Should calculate rates", async function () {
    // getOddsFromBanks must be without marginality
    var a = await core.getOddsFromBanks(1500000000, 3000000000, 100000, OUTCOMEWIN_INDEX, 50000000, 1e9);
    dbg(
      "1.73 for 3.0 Bet outcome1 = %s with 5% newOdds = %s, (bank1=%s bank2=%s)",
      100000,
      utils.formatUnits(a, 9),
      1730000000,
      3000000000
    );
    expect(a).to.equal(2786938440);

    a = await core.getOddsFromBanks(50000000, 50000000, 100000, OUTCOMEWIN_INDEX, 50000000, 1e9);
    dbg(
      "1 for 1 Bet outcome1 = %s with 5% newOdds = %s, (bank1=%s bank2=%s)",
      100000,
      utils.formatUnits(a, 9),
      50000000,
      50000000
    );
    expect(a).to.equal(1902955904);

    a = await core.getOddsFromBanks(50000000, 50000000, 25000000, OUTCOMEWIN_INDEX, 50000000, 1e9);
    dbg(
      "1 for 1 Bet outcome1 = %s with 5% newOdds = %s (bank1=%s bank2=%s)",
      25000000,
      utils.formatUnits(a, 9),
      50000000,
      50000000
    );
    expect(a).to.equal(1600666871);
  });

  it("Make large bet", async function () {
    time = await getBlockTime(ethers);

    let condIDHash = await createCondition(
      core,
      oracle,
      0, //condID,
      0, //SCOPE_ID,
      [odds2, odds1],
      [OUTCOMEWIN, OUTCOMELOSS],
      time + ONE_WEEK,
      "ipfs"
    );

    for (const iterator of Array(1000).keys()) {
      await makeBetGetTokenId(lp, adr1, condIDHash, tokens(1), OUTCOMEWIN, time + 10000, 0);
      await makeBetGetTokenId(lp, adr1, condIDHash, tokens(1), OUTCOMELOSS, time + 10000, 0);
    }

    let tokenId = await makeBetGetTokenId(lp, adr1, condIDHash, tokens(500), OUTCOMEWIN, time + 10000, 0);

    await timeShiftBy(ethers, ONE_WEEK);
    await core.connect(oracle).resolveCondition(0, OUTCOMEWIN);
    //console.log(await makeWithdrawPayout(lp, adr1, tokenId));
  });
});
