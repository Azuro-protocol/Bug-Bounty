const { isCommunityResourcable } = require("@ethersproject/providers");
const { expect } = require("chai");
const { constants, BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const {
  getRandomConditionId,
  getBlockTime,
  timeShift,
  timeShiftBy,
  tokens,
  getTokenId,
  getConditioIdHash,
  prepareEmptyStand,
  getLPNFTToken,
  getWinthdrawnAmount,
} = require("../utils/utils");
const dbg = require("debug")("test:liquidity");

const CONDITION_START = 13253453;
const LIQUIDITY = tokens(2000000);
const ONE_DAY = 86400;
const CONDID = 1;
const SCOPE_ID = 1;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const WITHDRAW_100_PERCENT = 1000000000000;
const WITHDRAW_50_PERCENT = 500000000000;
const WITHDRAW_20_PERCENT = 200000000000;
const TOKENS_1000 = tokens(1_000);
const TOKENS_4000 = tokens(4_000);
const TOKENS_5000 = tokens(5_000);
const TOKENS_20000 = tokens(20_000);
const FIRST_DEPO = tokens(100);
const SECOND_DEPO = tokens(100);

const reinforcement = tokens(20_000); // 10%
const marginality = 50000000; // 5%

const approveAmount = tokens(999_999_999_999_999);
const pool1 = 5000000;
const pool2 = 5000000;

const DEPO_A = tokens(120_000);
const DEPO_B = tokens(10_000);

let owner, lpSupplier, lpSupplier2, lpOwner, oracle, oracle2, mainteiner;
let Core, core, core2, Usdt, usdt, LP, lp;
let now, BalBefore, BalAfter, condIDHash, lpnft0;

let condID = 0;
let condIDs = [];
let condIDHashes = [];
let LPNFT_A, LPNFT_B;

const createCondition = async (core, oracle, condID, scopeID, pools, outcomes, time, ipfsHash) => {
  let txCreate = await core
    .connect(oracle)
    .createCondition(condID, scopeID, pools, outcomes, time, ethers.utils.formatBytes32String(ipfsHash));

  let condIDHash = await getConditioIdHash(txCreate);
  return condIDHash;
};

const makeBetGetTokenId = async (lp, user, condIDHash, betAmount, outcome, deadline, minrate) => {
  let txBet = await lp.connect(user).bet(condIDHash, betAmount, outcome, deadline, minrate);
  let res = await getTokenId(txBet);
  return res;
};

describe("Liquidity test", function () {
  let condID = CONDITION_START;

  beforeEach(async () => {
    [owner, lpOwner, lpSupplier, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
      await ethers.getSigners();

    now = await getBlockTime(ethers);

    [core, core2, usdt, lp] = await prepareEmptyStand(
      ethers,
      owner,
      lpSupplier,
      oracle,
      oracle2,
      mainteiner,
      reinforcement,
      marginality
    );
  });

  describe("Add liquidity before and after condition", () => {
    beforeEach(async () => {
      await usdt.approve(lp.address, approveAmount);
      await usdt.connect(lpSupplier).approve(lp.address, approveAmount);
      lpnft0 = await getLPNFTToken(await lp.addLiquidity(LIQUIDITY));

      await usdt.connect(owner).transfer(lpSupplier2.address, TOKENS_1000);
      await usdt.connect(lpSupplier2).approve(lp.address, TOKENS_1000);

      LPNFT = await getLPNFTToken(await lp.connect(lpSupplier2).addLiquidity(FIRST_DEPO));

      // make condition
      time = await getBlockTime(ethers);
      condIDHash = await createCondition(
        core,
        oracle,
        SCOPE_ID,
        CONDID,
        [pool2, pool1],
        [OUTCOMEWIN, OUTCOMELOSE],
        time + ONE_DAY,
        "ipfs"
      );

      LPNFT2 = await getLPNFTToken(await lp.connect(lpSupplier2).addLiquidity(SECOND_DEPO));
    });
    it("codition with loss bets, withdraw first add increased, second not changed", async () => {
      // make 120 bets loosed and lp getting more $
      for (const i of Array(100).keys()) {
        await makeBetGetTokenId(lp, owner, condIDHash, tokens(200), OUTCOMELOSE, time + 1000, 0);
      }

      // pass 1 day and resolve condition
      await timeShiftBy(ethers, ONE_DAY);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      let amount0 = await getWinthdrawnAmount(await lp.connect(owner).withdrawLiquidity(lpnft0, WITHDRAW_100_PERCENT));
      let amount1 = await getWinthdrawnAmount(
        await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT, WITHDRAW_100_PERCENT)
      );
      let amount2 = await getWinthdrawnAmount(
        await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT2, WITHDRAW_100_PERCENT)
      );

      expect(amount0).to.be.gt(LIQUIDITY);
      expect(amount1).to.be.gt(FIRST_DEPO);
      expect(amount2).to.be.equal(SECOND_DEPO);

      // try double withdraw
      await expect(lp.connect(owner).withdrawLiquidity(lpnft0, WITHDRAW_100_PERCENT)).to.be.revertedWith("NoLiquidity");
    });

    it("codition with win bets, try withdraw before resolve", async () => {
      // make 120 bets loosed and lp getting more $
      for (const i of Array(100).keys()) {
        await makeBetGetTokenId(lp, owner, condIDHash, tokens(2000), OUTCOMEWIN, time + 1000, 0);
      }

      // try withdraw main liquidity before resolve
      await expect(lp.connect(owner).withdrawLiquidity(lpnft0, WITHDRAW_100_PERCENT)).to.be.revertedWith(
        "LiquidityIsLocked"
      );

      await timeShiftBy(ethers, ONE_DAY);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      let amount0 = await getWinthdrawnAmount(await lp.connect(owner).withdrawLiquidity(lpnft0, WITHDRAW_100_PERCENT));

      expect(amount0).to.be.lt(LIQUIDITY);
    });

    it("codition with win bets, withdraw, first add reduced, second not changed", async () => {
      // make 120 bets loosed and lp getting more $
      for (const i of Array(100).keys()) {
        await makeBetGetTokenId(lp, owner, condIDHash, tokens(200), OUTCOMEWIN, time + 1000, 0);
      }

      // pass 1 day and resolve condition
      await timeShiftBy(ethers, ONE_DAY);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      let tx1 = await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT, WITHDRAW_100_PERCENT);
      let tx2 = await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT2, WITHDRAW_100_PERCENT);

      expect(await getWinthdrawnAmount(tx1)).to.be.lt(FIRST_DEPO);
      expect(await getWinthdrawnAmount(tx2)).to.be.equal(SECOND_DEPO);
    });
    it("change minBet and try low liquidity add", async () => {
      await lp.changeMinDepo(tokens(1000));

      // make low liquidity add
      await expect(lp.addLiquidity(tokens(200))).to.be.revertedWith("AmountNotSufficient()");
    });
    it("change withdraw timeout and withdraw", async () => {
      time = await getBlockTime(ethers);
      let lpNFT = await getLPNFTToken(await lp.addLiquidity(tokens(1000)));

      let withdrawAmount = await lp.nodeWithdrawView(lpNFT);

      // set one day timeout
      await lp.changeWithdrawTimeout(ONE_DAY);

      let timeDiffer = (await getBlockTime(ethers)) - time;

      // try liquidity withdraw with error
      await expect(lp.withdrawLiquidity(lpNFT, WITHDRAW_100_PERCENT)).to.be.revertedWith(
        "WithdrawalTimeout(" + (ONE_DAY - timeDiffer) + ")"
      );

      // +1 day
      await timeShiftBy(ethers, ONE_DAY);

      // try liquidity withdraw successfully
      expect(await getWinthdrawnAmount(await lp.withdrawLiquidity(lpNFT, WITHDRAW_100_PERCENT))).to.be.equal(
        withdrawAmount
      );
    });
  });
});
describe("Add liquidity before and after condition", () => {
  before("prepare", async () => {
    [owner, lpOwner, USER_A, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
      await ethers.getSigners();

    [core, core2, usdt, lp] = await prepareEmptyStand(
      ethers,
      owner,
      USER_A,
      oracle,
      oracle2,
      mainteiner,
      reinforcement,
      marginality
    );

    await lp.connect(owner).changeOracleReward(0);
    await lp.connect(owner).changeDaoReward(0);

    /**
    	      dates	Liquidity Tree	lockedLiquidity
            20.04	     120000,00	          60000	"A depo" -> 120000	         "Conditions 1,2,3" -> 60000														
            21.04	     121161,76	          40000	"B,D,C bet 1k on 1" -> 3000	 "cond 1 resolve" -> 1161,76
            22.04	     131161,76	          40000	"B depo" -> 10000,00         "B,D,C bet 1k on 2" -> 3000
            22.04	     134161,76	          20000	"cond 2 resolve" -> 3000
    case 1	22.04	     129161,76	          20000	"B witdraw 1/2" -> 5000
    case 1	22.04	     129161,76	          20000	"B,D,C bet 1k on 3" -> 3000							
    case 2	23.04	     104329,41	          20000	"A witdraw 1/5" -> 24832,35289
    case 2	23.04	     102192,51	              0	"cond 3 resolve (loss)" -> 2136,90382
    case 2	24.04	     102192,51	          40000	"Conditions 4,5" -> 40000
    case 2	24.04	     102192,51	          40000	"B,D,C bet 1k on 4" -> 3000
    case 2	25.04	     103354,27	          20000	"cond 4 resolve (win)" -> 1161,764471
    case 3	25.04	      98298,07	          20000	"B withdraw" -> 5056,20
    case 4	25.04	      98298,07	          20000	"A withdraw 1/1" -> LiquidityIsLocked()
     */

    await usdt.connect(USER_A).transfer(USER_B.address, TOKENS_20000);
    await usdt.connect(USER_A).transfer(USER_C.address, TOKENS_4000);
    await usdt.connect(USER_A).transfer(USER_D.address, TOKENS_4000);
    await usdt.connect(USER_B).approve(lp.address, TOKENS_20000);
    await usdt.connect(USER_C).approve(lp.address, TOKENS_4000);
    await usdt.connect(USER_D).approve(lp.address, TOKENS_4000);

    await usdt.connect(USER_A).approve(lp.address, DEPO_A);
    LPNFT_A = await getLPNFTToken(await lp.connect(USER_A).addLiquidity(DEPO_A));
    expect((await lp.treeNode(1)).amount).to.be.equal(DEPO_A);

    for (const i of Array(5).keys()) {
      condID++;
      condIDs.push(condID);
    }

    // make 3 conditions, 120_000 total and 60_000 locked
    for (const i of condIDs.keys()) {
      if (i <= 2) {
        time = await getBlockTime(ethers);
        condIDHashes.push(
          await createCondition(
            core,
            oracle,
            condIDs[i],
            SCOPE_ID,
            [pool2, pool1],
            [OUTCOMEWIN, OUTCOMELOSE],
            BigNumber.from(ONE_DAY)
              .mul(i + 1)
              .add(BigNumber.from(time))
              .toString(),
            "ipfs"
          )
        );
      }
    }
    expect((await lp.treeNode(1)).amount).to.be.equal(DEPO_A);
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(60_000));

    // make 3 bets on condition #1
    await makeBetGetTokenId(lp, USER_B, condIDHashes[0], TOKENS_1000, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[0], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[0], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);

    // +1 day and resolve condition #1 - USER_B wins
    await timeShiftBy(ethers, ONE_DAY);
    await core.connect(oracle).resolveCondition(condIDs[0], OUTCOMEWIN);
    expect((await lp.treeNode(1)).amount).to.be.equal("121161764471000000000000"); // 121161.764471 DEPO(120000) + PROFIT (1161.764471)
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(40_000));

    // make 3 bets on condition #2 and USER_B depo
    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[1], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[1], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[1], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);

    let before = (await lp.treeNode(1)).amount;
    LPNFT_B = await getLPNFTToken(await lp.connect(USER_B).addLiquidity(DEPO_B));
    let afterAdd = (await lp.treeNode(1)).amount;
    expect(afterAdd.sub(before)).to.be.equal(DEPO_B); // 131161.764471

    // +1 day and resolve condition #2 - POOL wins
    await timeShiftBy(ethers, ONE_DAY);
    await core.connect(oracle).resolveCondition(condIDs[1], OUTCOMEWIN);
    let afterResolve = (await lp.treeNode(1)).amount;
    expect(afterResolve.sub(afterAdd)).to.be.equal(tokens(3_000)); // 134161.764471 pool win (3000)
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(20_000));
  });
  it("Case 1 User B withdraw 1/2 of 10000 depo and 3 bets on condition #3", async () => {
    expect(await lp.nodeWithdrawView(LPNFT_B)).to.be.equal(DEPO_B);
    expect(
      await getWinthdrawnAmount(await lp.connect(USER_B).withdrawLiquidity(LPNFT_B, WITHDRAW_50_PERCENT))
    ).to.be.equal(TOKENS_5000);
    expect((await lp.treeNode(1)).amount).to.be.equal("129161764471000000000000"); // 129161.764471 (liquidity USER_A + USER_B)

    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[2], TOKENS_1000, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[2], TOKENS_1000, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[2], TOKENS_1000, OUTCOMEWIN, time + 1000, 0);
  });
  it("Case 2 User A withdraw 1/5 of 120000 depo", async () => {
    const A_20_PERCENT = "24832352894200000000000"; // 24832.3528942 = (129161.764471 - 5000) / 5
    expect((await lp.nodeWithdrawView(LPNFT_A)).div(5)).to.be.equal(A_20_PERCENT);
    expect(
      await getWinthdrawnAmount(await lp.connect(USER_A).withdrawLiquidity(LPNFT_A, WITHDRAW_20_PERCENT))
    ).to.be.equal(A_20_PERCENT);

    // rest of liquidity
    expect((await lp.treeNode(1)).amount).to.be.equal("104329411576800000000000"); // 104329.4115768 = 129161.764471 - 24832.3528942 (liquidity USER_A + USER_B)

    // +1 day and resolve condition #3 - POOL loss
    await timeShiftBy(ethers, ONE_DAY);
    let beforeResolve = (await lp.treeNode(1)).amount;
    await core.connect(oracle).resolveCondition(condIDs[2], OUTCOMEWIN);
    afterResolve = (await lp.treeNode(1)).amount;
    expect(beforeResolve.sub(afterResolve)).to.be.equal("2136903820000000000000"); // 2136.90382 pool loss
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(0));

    // rest of liquidity
    expect((await lp.treeNode(1)).amount).to.be.equal("102192507756800000000000"); // 102192.5077568 = 104329.4115768 - 2136.90382 (liquidity - POOL loss )

    // make 2 conditions, 100_000 total and 40_000 locked
    for (const i of condIDs.keys()) {
      if (i >= 3) {
        time = await getBlockTime(ethers);
        condIDHashes.push(
          await createCondition(
            core,
            oracle,
            condIDs[i],
            SCOPE_ID,
            [pool2, pool1],
            [OUTCOMEWIN, OUTCOMELOSE],
            BigNumber.from(ONE_DAY)
              .mul(i - 2)
              .add(BigNumber.from(time))
              .toString(),
            "ipfs"
          )
        );
      }
    }
    expect((await lp.treeNode(1)).amount).to.be.equal("102192507756800000000000");
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(40_000));

    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[3], TOKENS_1000, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[3], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[3], TOKENS_1000, OUTCOMELOSE, time + 1000, 0);

    // +1 day and resolve condition #4 - POOL wins
    await timeShiftBy(ethers, ONE_DAY);
    beforeResolve = (await lp.treeNode(1)).amount;
    await core.connect(oracle).resolveCondition(condIDs[3], OUTCOMEWIN);
    afterResolve = (await lp.treeNode(1)).amount;
    expect(afterResolve.sub(beforeResolve)).to.be.equal("1161764471000000000000"); // 1161.764471 pool win
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(20_000));

    // rest of liquidity
    expect(afterResolve).to.be.equals("103354272227800000000000"); // 103354.2722278
  });

  it("Case 3 User B withdraw rest of depo", async () => {
    const B_WITHDRAW_REST = "5056841959185735655632"; // 5056.841959185735655632 = 5000 + 1161.764471 * (5000/103354.2722278)
    expect(await lp.nodeWithdrawView(LPNFT_B)).to.be.equal(B_WITHDRAW_REST);
    expect(
      await getWinthdrawnAmount(await lp.connect(USER_B).withdrawLiquidity(LPNFT_B, WITHDRAW_100_PERCENT))
    ).to.be.equal(B_WITHDRAW_REST);
  });

  it("Case 4 User A try withdraw all of depo", async () => {
    await expect(await lp.nodeWithdrawView(LPNFT_A)).gt((await lp.treeNode(1)).amount.sub(await lp.lockedLiquidity()));
    await expect(lp.connect(USER_A).withdrawLiquidity(LPNFT_A, WITHDRAW_100_PERCENT)).to.be.revertedWith(
      "LiquidityIsLocked()"
    );
    //console.log(await lp.LIQUIDITYNODES());
    let firstLeaf = 1_099_511_627_776;
    let lastLeaf = 1_099_511_627_776 * 2 - 1;
    //console.log((await lp.treeNode(1)).toString(), (await lp.getLeavesAmount(1, firstLeaf, lastLeaf, firstLeaf, lastLeaf)).toString());
    expect((await lp.treeNode(1)).amount).to.be.equal(
      await lp.getLeavesAmount(1, firstLeaf, lastLeaf, firstLeaf, lastLeaf)
    );
  });
});
