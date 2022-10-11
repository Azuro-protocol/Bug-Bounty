const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const {
  getBlockTime,
  timeShift,
  timeShiftBy,
  tokens,
  getTokenId,
  getTokenIdOdds,
  getConditionIdHash,
  prepareStand,
} = require("../utils/utils");
const dbg = require("debug")("test:extension");
const ONE_WEEK = 604800;

const SCOPE_ID = 1;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const ONE_HOUR = 3600;
const ONE_MINUTE = 60;
const LIQUIDITY = tokens(2000000);
const reinforcement = constants.WeiPerEther.mul(20000); // 10%
const marginality = 50000000; // 5%

describe("Extension test", function () {
  let owner, adr1, lpOwner, oracle, oracle2, maintainer;
  let Core, core, Usdt, wxDAI, LP, lp;
  let now;

  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%

  const pool1 = 5000000;
  const pool2 = 5000000;

  before(async () => {
    [owner, adr1, lpOwner, oracle, oracle2, maintainer] = await ethers.getSigners();

    now = (await getBlockTime(ethers)) + 30000;

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
    await owner.sendTransaction({ to: wxDAI.address, value: BigNumber.from(tokens(500_000_000)) });
  });

  it("Should go through betting workflow with 2 users with slippage", async function () {
    const betAmount = tokens("6000");
    const betAmount2 = tokens("6000");
    const outcomeWin = 1;
    const outcomeLose = 2;

    //  EVENT: create condition
    let condID = 345345323;
    let txCreate = await core
      .connect(oracle)
      .createCondition(
        condID,
        SCOPE_ID,
        [pool2, pool1],
        [outcomeWin, outcomeLose],
        now + 3600,
        ethers.utils.formatBytes32String("ipfs")
      );
    dbg("Condition created", condID);
    let condIDHash = await getConditionIdHash(txCreate);

    let approveAmount = tokens("9999999");

    await timeShift(now + 1);

    dbg("Block mined");
    let deadline = now + 10;
    let minrate = 1000000000;

    // first player put the bet
    await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP
    dbg("LP approved");

    let txBet1 = await lp.bet(
      condIDHash, // event
      betAmount, // bet amount value
      outcomeWin, // stake on
      deadline, // max actual datetime (unixtime)
      minrate // user set minimal odds of stake to be accepted
    );
    dbg("tx bet1 sent");

    // accepted bet returns "event NewBet(bytes32 indexed id, uint outcome, uint amount, uint odds);"

    let _res = await getTokenIdOdds(txBet1);
    let tokenId1 = _res.tokenId;
    let rate1 = _res.odds;

    dbg("NFT balance==================>", (await azurobet.connect(owner).balanceOf(owner.address)).toString());

    await azurobet.connect(owner).transferFrom(owner.address, adr1.address, tokenId1);

    dbg(
      "NFT balance==================>",
      (await azurobet.balanceOf(owner.address)).toString(),
      (await azurobet.balanceOf(adr1.address)).toString()
    );

    //  EVENT: second player put the bet
    await wxDAI.connect(adr1).approve(lp.address, approveAmount);
    let txBet2 = await lp.connect(adr1).bet(condIDHash, betAmount2, outcomeLose, deadline, minrate);
    let tokenId2 = await getTokenId(txBet2);

    now += 36001;
    await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
    // resolve condition by oracle
    await core.connect(oracle).resolveCondition(condID, outcomeWin);

    //  EVENT: first player get his payout
    const better1OldBalance = await wxDAI.balanceOf(owner.address);
    await azurobet.setApprovalForAll(lp.address, true);

    // try to withdraw stake #1 (adr1 hold it now)
    await expect(lp.withdrawPayout(tokenId1)).to.be.revertedWith("OnlyBetOwner");

    // transfer back to owner
    await azurobet.connect(adr1).transferFrom(adr1.address, owner.address, tokenId1);

    // try to withdraw stake #1 from owner - must be ok
    await lp.withdrawPayout(tokenId1);
    const better1NewBalance = await wxDAI.balanceOf(owner.address);

    dbg(
      "NFT balance after withdraw==================>",
      (await azurobet.balanceOf(owner.address)).toString(),
      (await azurobet.balanceOf(adr1.address)).toString()
    );

    let better1OldBalance_plus_calculation = better1OldBalance
      .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
      .toString();
    expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

    // if second player go for payout he does not got anything because he lose the bet
    let token2Payout = await lp.viewPayout(tokenId2);
    dbg("payouts for token2 isWin =", token2Payout[0], "Payout value", token2Payout[1].toString());

    // call will be reverted with `No win no prize` message NoWinNoPrize()
    await expect(lp.connect(adr1).withdrawPayout(tokenId2)).to.be.revertedWith("NoWinNoPrize");
  });

  it("Should go through betting workflow with 2 users with bid more than pool", async function () {
    const betAmount = tokens("60000");
    const betAmount2 = tokens("6000");
    now += 4000;

    //  EVENT: create condition
    let condID = 345345324;
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

    let approveAmount = tokens("9999999");

    await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);

    let deadline = now + 10;
    let minrate = 1000000000;

    // first player put the bet
    await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

    let txBet1 = await lp.bet(
      condIDHash, // event
      betAmount, // bet amount value
      OUTCOMEWIN, // stake on
      deadline, // max actual datetime (unixtime)
      minrate // user set minimal odds of stake to be accepted
    );

    let _res = await getTokenIdOdds(txBet1);
    let tokenId1 = _res.tokenId;
    let rate1 = _res.odds;

    //  EVENT: second player put the bet
    await wxDAI.connect(adr1).approve(lp.address, approveAmount);
    let txBet2 = await lp.connect(adr1).bet(condIDHash, betAmount2, OUTCOMELOSE, deadline, minrate);
    let tokenId2 = await getTokenId(txBet2);

    now += 3601;
    await timeShift(now + ONE_MINUTE);
    // resolve condition by oracle
    await core.connect(oracle).resolveCondition(condID, OUTCOMEWIN);

    //  EVENT: first player get his payout
    const better1OldBalance = await wxDAI.balanceOf(owner.address);
    await azurobet.setApprovalForAll(lp.address, true);

    // try to withdraw stake #1 from owner - must be ok
    await lp.withdrawPayout(tokenId1);
    const better1NewBalance = await wxDAI.balanceOf(owner.address);

    dbg(
      "NFT balance after withdraw==================>",
      (await azurobet.balanceOf(owner.address)).toString(),
      (await azurobet.balanceOf(adr1.address)).toString()
    );

    let better1OldBalance_plus_calculation = better1OldBalance
      .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
      .toString();
    expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

    // if second player go for payout he does not got anything because he lose the bet
    let token2Payout = await lp.viewPayout(tokenId2);
    dbg("payouts for token2 isWin =", token2Payout[0], "Payout value", token2Payout[1].toString());

    await expect(lp.connect(adr1).withdrawPayout(tokenId2)).to.be.revertedWith("NoWinNoPrize");
  });

  describe("Detailed tests", function () {
    let conditionA, conditionB, conditionC, conditionAHash, conditionBHash, conditionCHash;
    conditionA = 100000323;
    conditionB = 200000323;
    conditionC = 300000323;
    let approveAmount = tokens("4000000000");
    let minrate = 1000000000;
    let deadline = now + 999999999;

    beforeEach(async () => {
      now = now + ONE_HOUR;
      deadline = now + 999999999;
      conditionA++;
      let txCreateA = await core
        .connect(oracle)
        .createCondition(
          conditionA,
          SCOPE_ID,
          [19800, 200],
          [OUTCOMEWIN, OUTCOMELOSE],
          now,
          ethers.utils.formatBytes32String("ipfs")
        );
      conditionAHash = await getConditionIdHash(txCreateA);

      conditionB++;
      let txCreateB = await core
        .connect(oracle)
        .createCondition(
          conditionB,
          SCOPE_ID,
          [10000, 10000],
          [OUTCOMEWIN, OUTCOMELOSE],
          now,
          ethers.utils.formatBytes32String("ipfs")
        );
      conditionBHash = await getConditionIdHash(txCreateB);

      conditionC++;
      let txCreateC = await core
        .connect(oracle)
        .createCondition(
          conditionC,
          SCOPE_ID,
          [200, 19800],
          [OUTCOMEWIN, OUTCOMELOSE],
          now,
          ethers.utils.formatBytes32String("ipfs")
        );
      conditionCHash = await getConditionIdHash(txCreateC);
    });
    it("Should register bet with no slippage with bet 1/100", async function () {
      let betAmount = tokens("1");
      let betAmount2 = tokens("99");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionAHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("19.275329236");

      // bet 2
      let txBet2 = await lp.bet(
        conditionAHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET A = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.001868625");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionA, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with no slippage with bet 1/2", async function () {
      let betAmount = tokens("200");
      let betAmount2 = tokens("200");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionBHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("BET ID A = ", tokenId1);
      dbg("RATE BET A = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.887012779");

      // bet 2
      let txBet2 = await lp.bet(
        conditionBHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET  = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.920769338");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionB, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with no slippage with bet 99/100", async function () {
      let betAmount = tokens("99");
      let betAmount2 = tokens("4");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionCHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.001847473");

      // bet 2
      let txBet2 = await lp.bet(
        conditionCHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET A = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("19.263247242");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionC, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });

    it("Should register bet with slippage with bet 1/100", async function () {
      let betAmount = tokens("10");
      let betAmount2 = tokens("990");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionAHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("19.214254267");

      // bet 2
      let txBet2 = await lp.bet(
        conditionAHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.001897212");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionA, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with slippage with bet 1/2", async function () {
      let betAmount = tokens("500");
      let betAmount2 = tokens("500");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionBHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.861626715");

      // bet 2
      let txBet2 = await lp.bet(
        conditionBHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET  = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.943431028");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionB, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with slippage with bet 99/100", async function () {
      let betAmount = tokens("1000");
      let betAmount2 = tokens("10");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionCHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.001696088");

      // bet 2
      let txBet2 = await lp.bet(
        conditionCHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("19.293351818");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionC, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });

    it("Should register bet with huge slippage with bet 1/100", async function () {
      let betAmount = tokens("200");
      let betAmount2 = tokens("19800");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionAHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("17.624531243");

      // bet 2
      let txBet2 = await lp.bet(
        conditionAHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.002207622");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionA, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with huge slippage with bet 1/2", async function () {
      let betAmount = tokens("10000");
      let betAmount2 = tokens("10000");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionBHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.446763275");

      // bet 2
      let txBet2 = await lp.bet(
        conditionBHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET  = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("2.16313218");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionB, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("Should register bet with huge slippage with bet 99/100", async function () {
      let betAmount = tokens("19800");
      let betAmount2 = tokens("200");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionCHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("1.000479797");

      // bet 2
      let txBet2 = await lp.bet(
        conditionCHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("19.313355141");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionC, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });

    it("attack on pool with bet 1/100", async function () {
      let betAmount = tokens("1000");
      let betAmount2 = tokens("100000");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionAHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("11.483716596");

      // bet 2
      let txBet2 = await lp.bet(
        conditionAHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("1.00218867");
      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionA, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("attack on pool  with huge slippage with bet 1/2", async function () {
      let betAmount = tokens("50000");
      let betAmount2 = tokens("50000");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionBHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9)); // todo hardcode check
      expect(utils.formatUnits(rate1, 9)).to.equal("1.135938264");

      // bet 2
      let txBet2 = await lp.bet(
        conditionBHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET  = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("2.019979863");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionB, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });
    it("attack on pool  with huge slippage with bet 99/100", async function () {
      let betAmount = tokens("100000");
      let betAmount2 = tokens("1000");

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        conditionCHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("1.000052895");

      // bet 2
      let txBet2 = await lp.bet(
        conditionCHash, // event
        betAmount2, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("19.298853711");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(conditionC, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });

    it("should check with super low bet", async function () {
      let betAmount = tokens("50");

      // first player put the bet
      let condID = 21312435323;
      now = (await getBlockTime(ethers)) + ONE_HOUR;
      let txCreate = await core
        .connect(oracle)
        .createCondition(
          condID,
          SCOPE_ID,
          [150, 260],
          [OUTCOMEWIN, OUTCOMELOSE],
          now,
          ethers.utils.formatBytes32String("ipfs")
        );

      let condIDHash = await getConditionIdHash(txCreate);

      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      let txBet1 = await lp.bet(
        condIDHash, // event
        betAmount, // bet amount value
        1, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      let _res = await getTokenIdOdds(txBet1);
      let tokenId1 = _res.tokenId;
      let rate1 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate1, 9));
      expect(utils.formatUnits(rate1, 9)).to.equal("1.515853055");

      // bet 2
      let txBet2 = await lp.bet(
        condIDHash, // event
        betAmount, // bet amount value
        2, // stake on
        deadline, // max actual datetime (unixtime)
        minrate // user set minimal odds of stake to be accepted
      );

      _res = await getTokenIdOdds(txBet2);
      let rate2 = _res.odds;

      dbg("RATE BET = ", utils.formatUnits(rate2, 9));
      expect(utils.formatUnits(rate2, 9)).to.equal("2.557094313");

      await timeShiftBy(ethers, ONE_HOUR + ONE_MINUTE);
      // resolve condition by oracle
      await core.connect(oracle).resolveCondition(condID, 1);

      //  EVENT: first player get his payout
      const better1OldBalance = await wxDAI.balanceOf(owner.address);
      await azurobet.setApprovalForAll(lp.address, true);

      // try to withdraw stake #1 from owner - must be ok
      await lp.withdrawPayout(tokenId1);
      const better1NewBalance = await wxDAI.balanceOf(owner.address);

      let better1OldBalance_plus_calculation = better1OldBalance
        .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
        .toString();
      expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);
    });

    it("should check bet less than min", async function () {
      let betAmount = 2;

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      await expect(
        lp.bet(
          conditionCHash, // event
          betAmount, // bet amount value
          1, // stake on
          deadline, // max actual datetime (unixtime)
          minrate // user set minimal odds of stake to be accepted
        )
      ).to.be.revertedWith("SmallBet");
    });

    it("Should check user slippage limit", async function () {
      let betAmount = tokens("10");
      minrate = 19251636897; // bet will be accepted with 19.241636897 current odds is 19,2820

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      await expect(
        lp.bet(
          conditionAHash, // event
          betAmount, // bet amount value
          1, // stake on
          deadline, // max actual datetime (unixtime)
          minrate // user set minimal odds of stake to be accepted
        )
      ).to.be.revertedWith("SmallOdds");
    });
    it("Should revert on big difference", async function () {
      let betAmount = tokens("300000000");

      minrate = 0;

      // first player put the bet
      await wxDAI.approve(lp.address, approveAmount); // approve wxDAI for the contract LP

      await expect(
        lp.bet(
          conditionCHash, // event
          betAmount, // bet amount value
          1, // stake on
          deadline, // max actual datetime (unixtime)
          minrate // user set minimal odds of stake to be accepted
        )
      ).to.be.revertedWith("BigDifference");
    });
  });
});
