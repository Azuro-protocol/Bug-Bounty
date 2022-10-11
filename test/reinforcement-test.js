const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getBlockTime, tokens, prepareStand, getConditionIdHash } = require("../utils/utils");
const dbg = require("debug")("test:reinforcement");

const SCOPE_ID = 1;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const LIQUIDITY = tokens(2000000);

describe("Reinforcement test", function () {
  // redeploy
  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%
  let now;

  const pool1 = 5000000;
  const pool2 = 5000000;

  before(async () => {
    [owner, adr1, lpOwner, oracle, oracle2, maintainer] = await ethers.getSigners();

    now = await getBlockTime(ethers);

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
  });
  it("Should check reinforcement limits", async function () {
    let condID = 3454364475358;
    fund1Should = reinforcement.mul(pool1).div(pool1 + pool2);
    for (let i = 0; i < 50; i++) {
      condID++;
      let txCreate = await core
        .connect(oracle)
        .createCondition(
          condID,
          SCOPE_ID,
          [pool2, pool1],
          [OUTCOMEWIN, OUTCOMELOSE],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        );
      let condIDHash = await getConditionIdHash(txCreate);
      let condition = await core.getCondition(condIDHash);
      expect(condition.fundBank[0]).to.equal(fund1Should);
    }
    let condID2 = 6579767;
    await expect(
      core
        .connect(oracle)
        .createCondition(
          condID2,
          SCOPE_ID,
          [pool2, pool1],
          [OUTCOMEWIN, OUTCOMELOSE],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        )
    ).to.be.revertedWith("NotEnoughLiquidity");

    // change reinforcement ability from 50% to 51% will allow for 1 condition creation
    await lp.changeReinforcementAbility("510000000"); // 51%
    await core
      .connect(oracle)
      .createCondition(
        condID2,
        SCOPE_ID,
        [pool2, pool1],
        [OUTCOMEWIN, OUTCOMELOSE],
        now + 3600,
        ethers.utils.formatBytes32String("ipfs")
      );

    // new condition is not fit for reinforcement ability condition
    await expect(
      core
        .connect(oracle)
        .createCondition(
          ++condID2,
          SCOPE_ID,
          [pool2, pool1],
          [OUTCOMEWIN, OUTCOMELOSE],
          now + 3600,
          ethers.utils.formatBytes32String("ipfs")
        )
    ).to.be.revertedWith("NotEnoughLiquidity");
  });
});
