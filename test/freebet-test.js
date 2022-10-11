const { expect } = require("chai");
const { constants, BigNumber } = require("ethers");
const { parseUnits, parseEther } = require("ethers/lib/utils");
const { ethers } = require("hardhat");
const { getBlockTime, tokens, prepareStand, makeCondition, timeShiftBy } = require("../utils/utils");

const LIQUIDITY = tokens(2000000);
const ONE_WEEK = 604800;
const ONE_HOUR = 3600;

const odds = (num) => parseUnits(num, 9);
const tokensBN = parseEther;

async function expectTuple(txRes, ...args) {
  const [...results] = await txRes;

  results.forEach((element, index) => {
    if (index >= args.length) return;
    expect(element).to.eq(args[index]);
  });
}

describe("FreeBet tests", function () {
  let owner, adr1, lpOwner, oracle, oracle2, maintainer, adr2, adr3;
  let core, core2, wxDAI, lp, freebet;
  let now;

  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%

  const URI = "https://smth.com";

  let newBet, newBet2;
  let condId1;

  beforeEach(async () => {
    [owner, adr1, lpOwner, oracle, oracle2, maintainer, adr2, adr3] = await ethers.getSigners();

    now = await getBlockTime(ethers);
    newBet = {
      amount: tokensBN("100"),
      minOdds: odds("1.5"),
      expirationTime: BigNumber.from(now + ONE_WEEK),
    };
    newBet2 = {
      amount: tokensBN("150"),
      minOdds: odds("1.4"),
      expirationTime: BigNumber.from(now + ONE_WEEK / 7),
    };

    [core, core2, wxDAI, lp, azurobet] = await prepareStand(
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

    const FreeBet = await ethers.getContractFactory("FreeBet");
    freebet = await upgrades.deployProxy(FreeBet, [wxDAI.address]);
    await freebet.deployed();

    await freebet.setLp(lp.address);

    // funding freebet
    await wxDAI.transfer(freebet.address, tokens(1000));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));

    condId1 = await makeCondition(ethers, lp, core, oracle, 13253453, 1, now + ONE_HOUR, [1, 2]);
    expect(condId1).to.eq("1");
  });

  it("Check changing FreeBet", async () => {
    const FreeBet = await ethers.getContractFactory("FreeBet");
    const freebet = await upgrades.deployProxy(FreeBet, [wxDAI.address]);
    await freebet.deployed();
  });
  it("Fails to change FreeBet if token is null", async () => {
    const FreeBet = await ethers.getContractFactory("FreeBet");
    await expect(upgrades.deployProxy(FreeBet, [ethers.constants.AddressZero])).to.be.revertedWith("WrongToken");
  });
  it("Check changing URI", async () => {
    await freebet.setBaseURI(URI);
    expect(await freebet.baseURI()).to.be.equal(URI);
  });
  it("Check supportsInterface EIP-165", async () => {
    expect(await freebet.supportsInterface(0x01ffc9a7)).to.be.equal(true);
  });

  it("Should withdraw all funds for owner", async () => {
    await freebet.withdraw(tokens(1000));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(0);
  });
  it("Should not withdraw if amount is too big", async () => {
    await expect(freebet.withdraw(tokens(10000))).to.be.revertedWith("InsufficientContractBalance");
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));
  });

  it("Should return empty array if no expired bets", async () => {
    const expired = await freebet.getExpiredUnburned(0, 10000);
    expect(expired[0]).to.eql(new Array(10000).fill(BigNumber.from(0)));
    expect(expired[1]).to.eq(0);
  });
  it("Should revert burn if bet is not expired", async () => {
    await expect(freebet.burnExpired([1, 2, 3])).to.be.revertedWith("BetNotExpired");
  });

  context("Minted freebet", async () => {
    beforeEach(async () => {
      await freebet.connect(owner).mint(adr1.address, newBet);
    });

    it("Should mint successfully", async () => {
      expect(await freebet.balanceOf(adr1.address)).to.eq(1);
      await expect(freebet.connect(owner).mint(adr1.address, newBet2))
        .to.emit(freebet, "FreeBetMinted")
        .withArgs(adr1.address, 2, [newBet2.amount, newBet2.minOdds, newBet2.expirationTime]);
      expect(await freebet.balanceOf(adr1.address)).to.eq(2);
      await expectTuple(await freebet.freeBets(2), newBet2.amount, newBet2.minOdds, newBet2.expirationTime);
    });

    it("Should mint batch", async () => {
      expect(await freebet.balanceOf(adr1.address)).to.eq(1);
      await expect(
        freebet.connect(owner).mintBatch([adr1.address, adr2.address, adr3.address], [newBet, newBet2, newBet2])
      ).to.emit(freebet, "FreeBetMintedBatch");
      await expectTuple(await freebet.freeBets(2), newBet.amount, newBet.minOdds, newBet.expirationTime);
      await expectTuple(await freebet.freeBets(3), newBet2.amount, newBet2.minOdds, newBet2.expirationTime);
      await expectTuple(await freebet.freeBets(4), newBet2.amount, newBet2.minOdds, newBet2.expirationTime);
    });

    it("Should only burn expired bets", async () => {
      await freebet.connect(owner).mintBatch([adr1.address, adr2.address, adr3.address], [newBet, newBet2, newBet2]);
      await timeShiftBy(ethers, ONE_WEEK / 2);
      const [expired, length] = await freebet.getExpiredUnburned(0, 100);
      expect(length).to.eq(2);
      expect(expired).to.eql([
        BigNumber.from(3),
        BigNumber.from(4),
        ...new Array(100 - length).fill(BigNumber.from(0)),
      ]);
      const tx = freebet.burnExpired([3, 4]);
      await expect(tx).to.emit(freebet, "Transfer").withArgs(adr2.address, constants.AddressZero, 3);
      await expect(tx).to.emit(freebet, "Transfer").withArgs(adr3.address, constants.AddressZero, 4);
      expect((await freebet.getExpiredUnburned(0, 100))[0]).to.eql(new Array(100).fill(BigNumber.from(0)));
    });

    it("Can't be transferred", async () => {
      await expect(freebet.connect(adr1).transferFrom(adr1.address, owner.address, 1)).to.be.revertedWith(
        "NonTransferable"
      );
    });

    it("Should redeem correct freebet", async () => {
      const expectedOdds = await core.calculateOdds(1, tokens(50), 1);
      const tx = freebet.connect(adr1).redeem(1, condId1, tokens(50), 1, now + ONE_HOUR, odds("1.5"));

      await expect(tx).to.emit(freebet, "FreeBetRedeemed").withArgs(adr1.address, 1, tokens(50));

      await expect(tx)
        .to.emit(lp, "NewBet")
        .withArgs(adr1.address, 1, 1, 1, tokens(50), expectedOdds, tokens(10050), tokens(10000));
    });

    it("Shouldn't redeem expired freebet", async () => {
      await timeShiftBy(ethers, ONE_WEEK + 60);
      await expect(
        freebet.connect(adr1).redeem(1, condId1, tokens(50), 1, now + ONE_HOUR, odds("1.5"))
      ).to.be.revertedWith("BetExpired");
    });

    it("Should revert withdraw if requested tokens are locked", async () => {
      await expect(freebet.withdraw(tokens(1000))).to.be.revertedWith("InsufficientContractBalance");
      expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));
    });

    it("Should let withdraw unlocked tokens", async () => {
      await freebet.withdraw(tokens(900));
      await timeShiftBy(ethers, ONE_WEEK + 60);
      const [ids, length] = await freebet.getExpiredUnburned(0, 100);
      await freebet.burnExpired(ids.slice(0, length));
      await freebet.withdraw(tokens(100));
      expect(await wxDAI.balanceOf(freebet.address)).to.eq(0);
    });
  });
});
