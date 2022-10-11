const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const {
  getBlockTime,
  timeShiftBy,
  tokens,
  createCondition,
  prepareEmptyStand,
  prepareStandNativeLiquidity,
  getLPNFTToken,
  getWinthdrawnAmount,
  getwithdrawLiquidityDetails,
  makeWithdrawPayout,
  makeBetGetTokenId,
  makeBetNativeGetTokenId,
  makeBetGetTokenIdOdds,
  makeAddLiquidityNative,
  makeWithdrawPayoutNative,
  makeWithdrawLiquidityNative,
  makeConditionWinBetResolve,
  getLiquidityCorrectness,
  makeConditionLossBet,
} = require("../utils/utils");
const dbg = require("debug")("test:liquidity");

const CONDITION_START = 13253453;
const LIQUIDITY = tokens(600_000_000_000);
const ONE_MONTH = 2592000;
const ONE_DAY = 86400;
const ONE_MINUTE = 60;
const CONDID = 1;
const CONDID2 = 2;
const CONDIDs = [3, 4, 5, 6, 7, 8];
const SCOPE_ID = 1;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const WIN_LOSS = [OUTCOMEWIN, OUTCOMELOSE];
const WITHDRAW_100_PERCENT = 1000000000000;
const WITHDRAW_80_PERCENT = 800000000000;
const WITHDRAW_50_PERCENT = 500000000000;
const WITHDRAW_20_PERCENT = 200000000000;
const TOKENS_1K = tokens(1_000);
const TOKENS_4K = tokens(4_000);
const TOKENS_5K = tokens(5_000);
const TOKENS_20K = tokens(20_000);
const TOKENS_100K = tokens(100_000);
const TOKENS_100 = tokens(100);
const TOKENS_200 = tokens(200);
const FIRST_DEPO = TOKENS_100;
const SECOND_DEPO = TOKENS_100;

const reinforcement = TOKENS_20K; // 10%
const marginality = 50000000; // 5%

const approveAmount = tokens(999_999_999_999_999);
const pool1 = 5000000;
const pool2 = 5000000;

const DEPO_A = tokens(120_000);
const DEPO_B = tokens(10_000);

let owner, lpSupplier, lpSupplier2, oracle, oracle2, mainteiner;
let core, wxDAI, lp;
let condIDHash, lpnft0;

let condID = 0;
let condIDs = [];
let condIDHashes = [];
let LPNFT_A, LPNFT_B;

describe("Liquidity test", function () {
  let condID = CONDITION_START;

  beforeEach(async () => {
    [owner, lpOwner, lpSupplier, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
      await ethers.getSigners();

    now = await getBlockTime(ethers);

    [core, core2, wxDAI, lp] = await prepareEmptyStand(
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

  it("Initial LP withdraws liquidity", async () => {
    await wxDAI.approve(lp.address, approveAmount);
    await wxDAI.connect(lpSupplier).approve(lp.address, approveAmount);
    // Add initial liquidity
    LPNFT = await getLPNFTToken(await lp.addLiquidity(TOKENS_100K));

    // Create condition
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

    // Second LP adds liquidity >= the reinforcement amount for the condition
    await wxDAI.connect(owner).transfer(lpSupplier2.address, TOKENS_20K);
    await wxDAI.connect(lpSupplier2).approve(lp.address, TOKENS_20K);
    LPNFT2 = await getLPNFTToken(await lp.connect(lpSupplier2).addLiquidity(TOKENS_20K));

    // Place a winning bet
    let tokenId = await makeBetGetTokenId(lp, owner, condIDHash, TOKENS_100, OUTCOMEWIN, time + 1000, 0);

    //console.log("0 lp_bal=", await wxDAI.balanceOf(lp.address));
    // Withdraw all initial liquidity
    let res = await getwithdrawLiquidityDetails(await lp.withdrawLiquidity(LPNFT, WITHDRAW_100_PERCENT));
    //console.log("1 lp_bal=", await wxDAI.balanceOf(lp.address));
    expect(res.amount).to.be.equal(TOKENS_100K);
    expect(res.tokenId).to.be.equal(LPNFT);
    expect(res.account).to.be.equal(owner.address);

    // Pass 1 day and resolve condition
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

    // Withdraw winning bet
    await lp.connect(owner).withdrawPayout(tokenId);

    //console.log("2 lp_bal=", await wxDAI.balanceOf(lp.address));
    // Withdraw second LPs liquidity
    let tx2 = await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT2, WITHDRAW_100_PERCENT);
    //console.log("3 lp_bal=", await wxDAI.balanceOf(lp.address));
    expect(await getWinthdrawnAmount(tx2)).to.be.equal("19910419835100000000000");
  });

  it("Initial LP withdraws 80% of liquidity", async () => {
    await wxDAI.approve(lp.address, approveAmount);
    await wxDAI.connect(lpSupplier).approve(lp.address, approveAmount);
    // Add initial liquidity
    LPNFT = await getLPNFTToken(await lp.addLiquidity(TOKENS_100K));

    // Create condition
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

    // Second LP adds liquidity >= the reinforcement amount for the condition
    await wxDAI.connect(owner).transfer(lpSupplier2.address, TOKENS_20K);
    await wxDAI.connect(lpSupplier2).approve(lp.address, TOKENS_20K);
    LPNFT2 = await getLPNFTToken(await lp.connect(lpSupplier2).addLiquidity(TOKENS_20K));

    // Place a winning bet
    let tokenId = await makeBetGetTokenId(lp, owner, condIDHash, TOKENS_100, OUTCOMEWIN, time + 1000, 0);

    // Withdraw 80% of initial liquidity
    let tx1 = await lp.withdrawLiquidity(LPNFT, WITHDRAW_80_PERCENT);
    expect(await getWinthdrawnAmount(tx1)).to.be.equal(tokens(80_000));

    // Pass 1 day and resolve condition
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

    // Withdraw winning bet
    await lp.connect(owner).withdrawPayout(tokenId);

    // Withdraw second LPs liquidity
    let tx2 = await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT2, WITHDRAW_100_PERCENT);
    expect(await getWinthdrawnAmount(tx2)).to.be.equal("19955209917550000000000");
  });

  describe("Add liquidity before and after condition", () => {
    beforeEach(async () => {
      await wxDAI.approve(lp.address, approveAmount);
      await wxDAI.connect(lpSupplier).approve(lp.address, approveAmount);
      lpnft0 = await getLPNFTToken(await lp.addLiquidity(LIQUIDITY));

      await wxDAI.connect(owner).transfer(lpSupplier2.address, TOKENS_1K);
      await wxDAI.connect(lpSupplier2).approve(lp.address, TOKENS_1K);

      LPNFT = await getLPNFTToken(await lp.connect(lpSupplier2).addLiquidity(FIRST_DEPO));

      // make condition
      time = await getBlockTime(ethers);
      condIDHash = await createCondition(
        core,
        oracle,
        CONDID,
        SCOPE_ID,
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
      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
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
    it("codition with win bets, withdraw bet payouts after the liquidity is withdrawn", async () => {
      let tokenIds = [];

      await expect(lp.claimDaoReward()).to.be.revertedWith("NoDaoReward()");
      await expect(core.connect(oracle).claimOracleReward()).to.be.revertedWith("NoOracleReward()");

      for (const i of Array(100).keys()) {
        tokenIds.push(await makeBetGetTokenId(lp, owner, condIDHash, tokens(2000), OUTCOMEWIN, time + 1000, 0));
      }

      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      //console.log("0 lp_bal=", await wxDAI.balanceOf(lp.address));
      await lp.connect(owner).withdrawLiquidity(lpnft0, WITHDRAW_100_PERCENT);
      //console.log("1 lp_bal=", await wxDAI.balanceOf(lp.address), "nodeWithdrawView", await lp.nodeWithdrawView(LPNFT));
      await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT, WITHDRAW_100_PERCENT);
      //console.log("2 lp_bal=", await wxDAI.balanceOf(lp.address));
      await lp.connect(lpSupplier2).withdrawLiquidity(LPNFT2, WITHDRAW_100_PERCENT);
      //console.log("3 lp_bal=", await wxDAI.balanceOf(lp.address));

      let betPayouts = await wxDAI.balanceOf(lp.address);
      let madePayouts = BigNumber.from(0);

      //console.log("getReserve()", await lp.getReserve());
      for (const i of tokenIds.keys()) {
        //console.log("i", i, "balanceOf(lp)", await wxDAI.balanceOf(lp.address));
        [amount, ,] = await makeWithdrawPayout(lp, owner, tokenIds[i]);
        madePayouts = madePayouts.add(amount);
      }

      expect(madePayouts).to.be.equal(betPayouts);
      expect(await lp.getReserve()).to.be.equal(0);
      expect(await lp.lockedLiquidity()).to.be.equal(0);

      // no rewards
      expect(await lp.realDaoRewards()).to.be.lt(0);
      expect(await lp.realOracleRewards()).to.be.lt(0);
      await expect(lp.claimDaoReward()).to.be.revertedWith("NoDaoReward()");
      await expect(core.connect(oracle).claimOracleReward()).to.be.revertedWith("NoOracleReward()");
    });
    it("codition with win bets, withdraw, first add reduced, second reduced", async () => {
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
      expect(await getWinthdrawnAmount(tx2)).to.be.lt(SECOND_DEPO);
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
    it("change Dao's and Oracle's claim timeout", async () => {
      // nothing to claim
      await expect(lp.claimDaoReward()).to.be.revertedWith("NoDaoReward()");
      await expect(core.connect(oracle).claimOracleReward()).to.be.revertedWith("NoOracleReward()");

      let res = await lp.changeClaimTimeout(ONE_MONTH);
      let eChange = (await res.wait()).events.filter((x) => {
        return x.event == "ClaimTimeoutChanged";
      });
      expect(eChange[0].args.newClaimTimeout).to.be.equal(ONE_MONTH);

      await makeBetGetTokenId(lp, owner, condIDHash, TOKENS_100, OUTCOMELOSE, time + 1000, 0);
      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      expect(await lp.realDaoRewards()).to.be.gt(0);
      expect(await lp.realOracleRewards()).to.be.gt(0);

      let multiplier = await lp.multiplier();

      let calcedDaoRewards = BigNumber.from(TOKENS_100)
        .mul(await lp.daoFee())
        .div(multiplier);
      let calcedOracleRewards = BigNumber.from(TOKENS_100)
        .mul(await lp.oracleFee())
        .div(multiplier);

      // first claim without timeout
      expect(await lp.realDaoRewards()).to.be.equal(calcedDaoRewards);
      expect(await lp.realOracleRewards()).to.be.equal(calcedOracleRewards);

      let oracleBefore = await wxDAI.balanceOf(oracle.address);
      let daoBefore = await wxDAI.balanceOf(owner.address);

      // get claim time
      let timeClaim = await getBlockTime(ethers);

      await lp.claimDaoReward();
      await core.connect(oracle).claimOracleReward();

      let oracleAfter = await wxDAI.balanceOf(oracle.address);
      let daoAfter = await wxDAI.balanceOf(owner.address);

      // withdrawn fees
      expect(oracleAfter.sub(oracleBefore)).to.be.equal(calcedOracleRewards);
      expect(daoAfter.sub(daoBefore)).to.be.equal(calcedDaoRewards);

      // all fees withdrawn and =0
      expect(await lp.realDaoRewards()).to.be.equal(0);
      expect(await lp.realOracleRewards()).to.be.equal(0);

      // make next condition
      time = await getBlockTime(ethers);
      condIDHash2 = await createCondition(
        core,
        oracle,
        CONDID2,
        SCOPE_ID,
        [pool2, pool1],
        [OUTCOMEWIN, OUTCOMELOSE],
        time + ONE_DAY,
        "ipfs"
      );

      await makeBetGetTokenId(lp, owner, condIDHash2, TOKENS_100, OUTCOMELOSE, time + 1000, 0);
      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID2, OUTCOMEWIN);

      // claim amounts ready
      expect(await lp.realDaoRewards()).to.be.equal(calcedDaoRewards);
      expect(await lp.realOracleRewards()).to.be.equal(calcedOracleRewards);

      // can't claim - not passed time

      await expect(lp.claimDaoReward()).to.be.revertedWith("ClaimTimeout(" + (timeClaim + ONE_MONTH + 1) + ")");
      await expect(core.connect(oracle).claimOracleReward()).to.be.revertedWith(
        "ClaimTimeout(" + (timeClaim + ONE_MONTH + 2) + ")"
      );

      // +1 MONTH
      await timeShiftBy(ethers, ONE_MONTH);

      oracleBefore = await wxDAI.balanceOf(oracle.address);
      daoBefore = await wxDAI.balanceOf(owner.address);

      await lp.claimDaoReward();
      await core.connect(oracle).claimOracleReward();

      oracleAfter = await wxDAI.balanceOf(oracle.address);
      daoAfter = await wxDAI.balanceOf(owner.address);

      // withdrawn fees
      expect(oracleAfter.sub(oracleBefore)).to.be.equal(calcedOracleRewards);
      expect(daoAfter.sub(daoBefore)).to.be.equal(calcedDaoRewards);
    });
    it("calc Dao's and Oracle's reward", async () => {
      const MULTIPLIER = await lp.multiplier();
      const BETNUMBER = BigNumber.from(TOKENS_100);

      // make negative rewards
      let betTx = await makeBetGetTokenIdOdds(lp, owner, condIDHash, TOKENS_100, OUTCOMEWIN, time + 1000, 0);

      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      let loss = BETNUMBER.mul(betTx.odds).div(MULTIPLIER).sub(BETNUMBER);
      let calcedDaoRewards = loss
        .mul(await lp.daoFee())
        .div(MULTIPLIER)
        .mul(-1);
      let calcedOracleRewards = loss
        .mul(await lp.oracleFee())
        .div(MULTIPLIER)
        .mul(-1);

      expect(await lp.realDaoRewards()).to.be.equal(calcedDaoRewards);
      expect(await lp.realOracleRewards()).to.be.equal(calcedOracleRewards);

      time = await getBlockTime(ethers);
      condIDHash2 = await createCondition(
        core,
        oracle,
        CONDID2,
        SCOPE_ID,
        [pool2, pool1],
        [OUTCOMEWIN, OUTCOMELOSE],
        time + ONE_DAY,
        "ipfs"
      );

      await makeBetGetTokenId(lp, owner, condIDHash2, TOKENS_100, OUTCOMELOSE, time + 1000, 0);
      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID2, OUTCOMEWIN);

      expect(await lp.realDaoRewards()).to.be.equal(
        calcedDaoRewards.add(BETNUMBER.mul(await lp.daoFee()).div(MULTIPLIER))
      );
      expect(await lp.realOracleRewards()).to.be.equal(
        calcedOracleRewards.add(BETNUMBER.mul(await lp.oracleFee()).div(MULTIPLIER))
      );
    });
    it("check rewards correctness", async () => {
      // make negative rewards
      await makeConditionWinBetResolve(ethers, lp, core, oracle, owner, CONDIDs[0], SCOPE_ID, WIN_LOSS, TOKENS_100);
      liqCor = await getLiquidityCorrectness(lp, wxDAI);
      expect(liqCor.check).to.be.equal(0);

      // rewards < 0, win
      expect(liqCor.daoRewards.add(liqCor.oracleRewards)).to.be.lt(0);
      await makeConditionWinBetResolve(ethers, lp, core, oracle, owner, CONDIDs[1], SCOPE_ID, WIN_LOSS, TOKENS_100);
      liqCor = await getLiquidityCorrectness(lp, wxDAI);
      expect(liqCor.check).to.be.equal(0);

      // rewards < 0, loss
      expect(liqCor.daoRewards.add(liqCor.oracleRewards)).to.be.lt(0);
      await makeConditionLossBet(ethers, lp, core, oracle, owner, CONDIDs[2], SCOPE_ID, WIN_LOSS, TOKENS_200);
      liqCor = await getLiquidityCorrectness(lp, wxDAI);
      expect(liqCor.check).to.be.equal(0);

      // rewards > 0, loss
      expect(liqCor.daoRewards.add(liqCor.oracleRewards)).to.be.gt(0);
      await makeConditionLossBet(ethers, lp, core, oracle, owner, CONDIDs[3], SCOPE_ID, WIN_LOSS, TOKENS_100);
      liqCor = await getLiquidityCorrectness(lp, wxDAI);
      expect(liqCor.check).to.be.equal(0);

      // rewards > 0, win
      expect(liqCor.daoRewards.add(liqCor.oracleRewards)).to.be.gt(0);
      await makeConditionWinBetResolve(ethers, lp, core, oracle, owner, CONDIDs[4], SCOPE_ID, WIN_LOSS, TOKENS_100);
      liqCor = await getLiquidityCorrectness(lp, wxDAI);
      expect(liqCor.check).to.be.equal(0);
    });
  });
});
describe("Liquidity test with native tokens", function () {
  let condID = CONDITION_START;

  describe("Prepared stand with native", async function () {
    beforeEach(async () => {
      [owner, lpOwner, lpSupplier, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
        await ethers.getSigners();

      now = await getBlockTime(ethers);

      [core, core2, wxDAI, lp, azurobet, math, lpnft] = await prepareStandNativeLiquidity(
        ethers,
        owner,
        lpSupplier,
        oracle,
        oracle2,
        mainteiner,
        reinforcement,
        marginality,
        LIQUIDITY
      );
    });

    it("Withdraw all initial liquidity as erc20", async () => {
      let balBefore = await wxDAI.balanceOf(owner.address);
      let tx1 = await lp.connect(owner).withdrawLiquidity(lpnft, WITHDRAW_100_PERCENT);
      let balAfter = await wxDAI.balanceOf(owner.address);
      expect(await getWinthdrawnAmount(tx1)).to.be.equal(LIQUIDITY);
      expect(balAfter.sub(balBefore)).to.be.equal(LIQUIDITY);
    });
    it("Withdraw all initial liquidity as native", async () => {
      balBefore = await ethers.provider.getBalance(owner.address);
      [withdrawAmount, gasUsed, account] = await makeWithdrawLiquidityNative(lp, owner, lpnft, WITHDRAW_100_PERCENT);
      balAfter = await ethers.provider.getBalance(owner.address);
      expect(withdrawAmount).to.be.equal(LIQUIDITY);
      expect(balAfter.sub(balBefore)).to.be.equal(BigNumber.from(LIQUIDITY).sub(gasUsed));
      expect(owner.address).to.be.equal(account);
    });
  });
  describe("Prepared empty stand", async function () {
    beforeEach(async () => {
      [owner, lpOwner, lpSupplier, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
        await ethers.getSigners();

      now = await getBlockTime(ethers);

      [core, core2, wxDAI, lp] = await prepareEmptyStand(
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

    it("Initial LP withdraws liquidity", async () => {
      // Add initial liquidity
      balBefore = await ethers.provider.getBalance(lpSupplier.address);
      [LPNFT, gasUsed, account, amount] = await makeAddLiquidityNative(lp, lpSupplier, TOKENS_100K);
      balAfter = await ethers.provider.getBalance(lpSupplier.address);
      expect(balBefore.sub(balAfter)).to.be.equal(BigNumber.from(TOKENS_100K).add(gasUsed));
      expect(account).to.be.equal(lpSupplier.address);
      expect(amount).to.be.equal(TOKENS_100K);

      // Create condition
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

      // Second LP adds liquidity >= the reinforcement amount for the condition
      balBefore = await ethers.provider.getBalance(lpSupplier2.address);
      [LPNFT2, gasUsed, account, amount] = await makeAddLiquidityNative(lp, lpSupplier2, TOKENS_20K);
      balAfter = await ethers.provider.getBalance(lpSupplier2.address);
      expect(balBefore.sub(balAfter)).to.be.equal(BigNumber.from(TOKENS_20K).add(gasUsed));
      expect(account).to.be.equal(lpSupplier2.address);
      expect(amount).to.be.equal(TOKENS_20K);

      // Place a winning bet
      balBefore = await ethers.provider.getBalance(owner.address);
      [tokenId, gasUsed, account] = await makeBetNativeGetTokenId(
        lp,
        owner,
        condIDHash,
        TOKENS_100,
        OUTCOMEWIN,
        time + 1000,
        0
      );
      balAfter = await ethers.provider.getBalance(owner.address);
      expect(balBefore.sub(balAfter)).to.be.equal(BigNumber.from(TOKENS_100).add(gasUsed));
      expect(account).to.be.equal(owner.address);

      // Withdraw all initial liquidity
      balBefore = await ethers.provider.getBalance(lpSupplier.address);
      [withdrawAmount, gasUsed, account] = await makeWithdrawLiquidityNative(
        lp,
        lpSupplier,
        LPNFT,
        WITHDRAW_100_PERCENT
      );
      balAfter = await ethers.provider.getBalance(lpSupplier.address);
      expect(withdrawAmount).to.be.equal(TOKENS_100K);
      expect(account).to.be.equal(lpSupplier.address);
      expect(balAfter.sub(balBefore)).to.be.equal(BigNumber.from(TOKENS_100K).sub(gasUsed));

      // Pass 1 day and resolve condition
      await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
      await core.connect(oracle).resolveCondition(CONDID, OUTCOMEWIN);

      // Withdraw winning bet
      balBefore = await ethers.provider.getBalance(owner.address);
      [resAmount, gasUsed, account] = await makeWithdrawPayoutNative(lp, owner, tokenId);
      balAfter = await ethers.provider.getBalance(owner.address);
      expect(resAmount).gt(TOKENS_100);
      expect(balAfter.sub(balBefore)).to.be.equal(BigNumber.from(resAmount).sub(gasUsed));
      expect(account).to.be.equal(owner.address);

      // Withdraw second LPs liquidity
      balBefore = await ethers.provider.getBalance(lpSupplier2.address);
      [withdrawAmount, gasUsed, account] = await makeWithdrawLiquidityNative(
        lp,
        lpSupplier2,
        LPNFT2,
        WITHDRAW_100_PERCENT
      );
      balAfter = await ethers.provider.getBalance(lpSupplier2.address);
      expect(withdrawAmount).to.be.equal("19910419835100000000000");
      expect(account).to.be.equal(lpSupplier2.address);
      expect(balAfter.sub(balBefore)).to.be.equal(BigNumber.from(withdrawAmount).sub(gasUsed));
    });
  });
});
describe("Add liquidity before and after condition", () => {
  before("prepare", async () => {
    [owner, lpOwner, USER_A, lpSupplier2, oracle, oracle2, mainteiner, USER_B, USER_C, USER_D] =
      await ethers.getSigners();

    [core, core2, wxDAI, lp] = await prepareEmptyStand(
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
            21.04	     121161,76	          40000	"B,D,C bet 1k on 1" -> 3000	 "cond 1 resolve" -> 1177.67
            22.04	     131161,76	          40000	"B depo" -> 10000,00         "B,D,C bet 1k on 2" -> 3000
            22.04	     134161,76	          20000	"cond 2 resolve" -> 3000
    case 1	22.04	     129161,76	          20000	"B witdraw 1/2" -> 5000
    case 1	22.04	     129161,76	          20000	"B,D,C bet 1k on 3" -> 3000							
    case 2	23.04	     104329,41	          20000	"A witdraw 1/5" -> 24835.5352176
    case 2	23.04	     102192,51	              0	"cond 3 resolve (loss)" -> 2100.989584
    case 2	24.04	     102192,51	          40000	"Conditions 4,5" -> 40000
    case 2	24.04	     102192,51	          40000	"B,D,C bet 1k on 4" -> 3000
    case 2	25.04	     103354,27	          20000	"cond 4 resolve (win)" -> 1177.676088
    case 3	25.04	      98298,07	          20000	"B withdraw" -> 4955.75
    case 4	25.04	      98298,07	          20000	"A withdraw 1/1" -> LiquidityIsLocked()
     */

    await wxDAI.connect(USER_A).transfer(USER_B.address, TOKENS_20K);
    await wxDAI.connect(USER_A).transfer(USER_C.address, TOKENS_4K);
    await wxDAI.connect(USER_A).transfer(USER_D.address, TOKENS_4K);
    await wxDAI.connect(USER_B).approve(lp.address, TOKENS_20K);
    await wxDAI.connect(USER_C).approve(lp.address, TOKENS_4K);
    await wxDAI.connect(USER_D).approve(lp.address, TOKENS_4K);

    await wxDAI.connect(USER_A).approve(lp.address, DEPO_A);
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
    await makeBetGetTokenId(lp, USER_B, condIDHashes[0], TOKENS_1K, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[0], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[0], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);

    // +1 day and resolve condition #1 - USER_B wins
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    await core.connect(oracle).resolveCondition(condIDs[0], OUTCOMEWIN);
    expect((await lp.treeNode(1)).amount).to.be.equal("121177676088000000000000"); // 121177.676088 DEPO(120000) + PROFIT (1177.676088)
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(40_000));

    // make 3 bets on condition #2 and USER_B depo
    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[1], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[1], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[1], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);

    let before = (await lp.treeNode(1)).amount;
    LPNFT_B = await getLPNFTToken(await lp.connect(USER_B).addLiquidity(DEPO_B));
    let afterAdd = (await lp.treeNode(1)).amount;
    expect(afterAdd.sub(before)).to.be.equal(DEPO_B); // 131161.764471

    // +1 day and resolve condition #2 - POOL wins
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    await core.connect(oracle).resolveCondition(condIDs[1], OUTCOMEWIN);
    let afterResolve = (await lp.treeNode(1)).amount;
    expect(afterResolve.sub(afterAdd)).to.be.equal(tokens(3_000)); // 134161.764471 pool win (3000)
    expect(await lp.lockedLiquidity()).to.be.equal(TOKENS_20K);
  });
  it("Case 1 User B withdraw 1/2 of 10000 depo and 3 bets on condition #3", async () => {
    expect(await lp.nodeWithdrawView(LPNFT_B)).to.be.equal(DEPO_B);
    expect(
      await getWinthdrawnAmount(await lp.connect(USER_B).withdrawLiquidity(LPNFT_B, WITHDRAW_50_PERCENT))
    ).to.be.equal(TOKENS_5K);
    expect((await lp.treeNode(1)).amount).to.be.equal("129177676088000000000000"); // 129177.676088 (liquidity USER_A + USER_B)

    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[2], TOKENS_1K, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[2], TOKENS_1K, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[2], TOKENS_1K, OUTCOMEWIN, time + 1000, 0);
  });
  it("Case 2 User A withdraw 1/5 of 120000 depo", async () => {
    const A_20_PERCENT = "24835535217600000000000"; // 24835.5352176 = (129177.676088 - 5000) / 5
    expect((await lp.nodeWithdrawView(LPNFT_A)).div(5)).to.be.equal(A_20_PERCENT);
    expect(
      await getWinthdrawnAmount(await lp.connect(USER_A).withdrawLiquidity(LPNFT_A, WITHDRAW_20_PERCENT))
    ).to.be.equal(A_20_PERCENT);

    // rest of liquidity
    expect((await lp.treeNode(1)).amount).to.be.equal("104342140870400000000000"); // 104342.1408704 = 129177.676088 - 24835.5352176 (liquidity USER_A + USER_B)

    // +1 day and resolve condition #3 - POOL loss
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    let beforeResolve = (await lp.treeNode(1)).amount;
    await core.connect(oracle).resolveCondition(condIDs[2], OUTCOMEWIN);
    afterResolve = (await lp.treeNode(1)).amount;
    expect(beforeResolve.sub(afterResolve)).to.be.equal("2100989584000000000000"); // 2100.989584 pool loss
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(0));

    // rest of liquidity
    expect((await lp.treeNode(1)).amount).to.be.equal("102241151286400000000000"); // 102241.1512864 = 104342.1408704 - 2100.989584 (liquidity - POOL loss )

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
    expect((await lp.treeNode(1)).amount).to.be.equal("102241151286400000000000");
    expect(await lp.lockedLiquidity()).to.be.equal(tokens(40_000));

    time = await getBlockTime(ethers);
    await makeBetGetTokenId(lp, USER_B, condIDHashes[3], TOKENS_1K, OUTCOMEWIN, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_C, condIDHashes[3], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);
    await makeBetGetTokenId(lp, USER_D, condIDHashes[3], TOKENS_1K, OUTCOMELOSE, time + 1000, 0);

    // +1 day and resolve condition #4 - POOL wins
    await timeShiftBy(ethers, ONE_DAY + ONE_MINUTE);
    beforeResolve = (await lp.treeNode(1)).amount;
    await core.connect(oracle).resolveCondition(condIDs[3], OUTCOMEWIN);
    afterResolve = (await lp.treeNode(1)).amount;
    expect(afterResolve.sub(beforeResolve)).to.be.equal("1177676088000000000000"); // 1177.676088 pool win
    expect(await lp.lockedLiquidity()).to.be.equal(TOKENS_20K);

    // rest of liquidity
    expect(afterResolve).to.be.equals("103418827374400000000000"); // 103418.8273744 = 102241.1512864 + 1177.676088
  });

  it("Case 3 User B withdraw rest of depo", async () => {
    const B_WITHDRAW_REST = "4955755484394995410126"; // 4955.755484394995410126 = 5000 + (1177.676088*5000-2100.989584*5000)/103418.8273744
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
