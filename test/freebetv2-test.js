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

function calcGas(receipt) {
  return receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
}

function initFixtureTree(provider) {
  let currentTestLayer = 0;

  function wrapLayer(fixture) {
    let myLayer = 0;
    let snapshotBefore = 0;
    let snapshotBeforeEach = 0;

    before(async () => {
      myLayer = ++currentTestLayer;
      snapshotBefore = await provider.send("evm_snapshot", []);
      await fixture();
    });

    beforeEach(async () => {
      if (currentTestLayer == myLayer) snapshotBeforeEach = await provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      if (currentTestLayer == myLayer) await provider.send("evm_revert", [snapshotBeforeEach]);
    });

    after(async () => {
      await provider.send("evm_revert", [snapshotBefore]);
      currentTestLayer--;
    });
  }

  return wrapLayer;
}

describe("FreeBetV2 tests", function () {
  const wrapLayer = initFixtureTree(ethers.provider);

  let owner, adr1, lpOwner, oracle, oracle2, maintainer, adr2, adr3;
  let core, core2, wxDAI, lp, freebet;
  let now;

  const reinforcement = constants.WeiPerEther.mul(20000); // 10%
  const marginality = 50000000; // 5%

  const URI = "https://smth.com";

  let newBet, newBet2;
  let condId1, oracleCondId1;

  async function deployAndInit() {
    [owner, adr1, lpOwner, oracle, oracle2, maintainer, adr2, adr3] = await ethers.getSigners();

    now = await getBlockTime(ethers);
    oracleCondId1 = 13253453;

    newBet = {
      amount: tokensBN("100"),
      minOdds: odds("1.5"),
      durationTime: BigNumber.from(ONE_WEEK),
    };
    newBet2 = {
      amount: tokensBN("150"),
      minOdds: odds("1.4"),
      durationTime: BigNumber.from(ONE_WEEK / 7),
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

    const FreeBet = await ethers.getContractFactory("FreeBetV2");
    freebet = await upgrades.deployProxy(FreeBet, [wxDAI.address]);
    await freebet.deployed();

    await freebet.setLp(lp.address);
    await freebet.updateMaintainer(maintainer.address, true);

    await wxDAI.transfer(maintainer.address, tokens(10000));
    expect(await wxDAI.balanceOf(maintainer.address)).to.eq(tokens(10000));

    // funding freebet
    await wxDAI.transfer(freebet.address, tokens(1000));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));

    condId1 = await makeCondition(ethers, lp, core, oracle, oracleCondId1, 1, ONE_HOUR, [1, 2]);
    expect(condId1).to.eq("1");
  }

  wrapLayer(deployAndInit);

  it("Check deploy FreeBet", async () => {
    const FreeBet = await ethers.getContractFactory("FreeBetV2");
    const freebet = await upgrades.deployProxy(FreeBet, [wxDAI.address]);
    await freebet.deployed();
  });
  it("Fails to deploy FreeBet if token is null", async () => {
    const FreeBet = await ethers.getContractFactory("FreeBetV2");
    await expect(upgrades.deployProxy(FreeBet, [ethers.constants.AddressZero])).to.be.revertedWith("WrongToken");
  });
  it("Check changing URI", async () => {
    await freebet.setBaseURI(URI);
    expect(await freebet.baseURI()).to.be.equal(URI);
  });
  it("Check supportsInterface EIP-165", async () => {
    expect(await freebet.supportsInterface(0x01ffc9a7)).to.be.equal(true);
  });
  it("Check only owner", async () => {
    await expect(freebet.connect(adr1).setBaseURI(URI)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(freebet.connect(maintainer).setLp(lp.address)).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Check only maintainer", async () => {
    await expect(freebet.connect(adr1).withdrawReserve(100)).to.be.revertedWith("OnlyMaintainer");
    await expect(freebet.connect(adr1).withdrawReserveNative(100)).to.be.revertedWith("OnlyMaintainer");
    await expect(freebet.connect(adr1).mint(adr2.address, newBet)).to.be.revertedWith("OnlyMaintainer");
    await expect(freebet.connect(owner).mintBatch([adr2.address, adr3.address], [newBet, newBet2])).to.be.revertedWith(
      "OnlyMaintainer"
    );
  });

  it("Should add funds for any user", async () => {
    const balanceBefore = await wxDAI.balanceOf(adr1.address);
    const balanceFreebetBefore = await wxDAI.balanceOf(freebet.address);
    await wxDAI.connect(adr1).approve(freebet.address, tokens(1000));
    await wxDAI.connect(adr1).transfer(freebet.address, tokens(1000));
    expect(await wxDAI.balanceOf(adr1.address)).to.eq(balanceBefore.sub(tokens(1000)));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(balanceFreebetBefore.add(tokens(1000)));
  });
  it("Should add funds in native for any user", async () => {
    const balanceNativeBefore = await adr1.getBalance();
    const balanceFreebetBefore = await wxDAI.balanceOf(freebet.address);
    const tx = await adr1.sendTransaction({ to: freebet.address, value: tokens(1000) });
    const res = await tx.wait();
    expect(await adr1.getBalance()).to.be.eq(balanceNativeBefore.sub(tokens(1000)).sub(calcGas(res)));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(balanceFreebetBefore.add(tokens(1000)));
  });
  it("Should withdraw all funds for maintainer", async () => {
    const balanceBefore = await wxDAI.balanceOf(maintainer.address);
    await freebet.connect(maintainer).withdrawReserve(tokens(1000));
    expect(await wxDAI.balanceOf(maintainer.address)).to.eq(balanceBefore.add(tokens(1000)));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(0);
  });
  it("Should withdraw all funds in native for maintainer", async () => {
    const balanceBefore = await wxDAI.balanceOf(maintainer.address);
    const balanceNativeBefore = await maintainer.getBalance();
    const tx = await freebet.connect(maintainer).withdrawReserveNative(tokens(1000));
    const res = await tx.wait();
    expect(await wxDAI.balanceOf(maintainer.address)).to.eq(balanceBefore);
    expect(await maintainer.getBalance()).to.be.eq(balanceNativeBefore.add(tokens(1000)).sub(calcGas(res)));
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(0);
  });
  it("Should not withdraw if amount is too big", async () => {
    await expect(freebet.connect(maintainer).withdrawReserve(tokens(10000))).to.be.revertedWith(
      "InsufficientContractBalance"
    );
    expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));
  });

  it("Should return empty array if no expired bets", async () => {
    const expired = await freebet.getExpiredUnburned(0, 1000);
    expect(expired[0]).to.eql(new Array(1000).fill(BigNumber.from(0)));
    expect(expired[1]).to.eq(0);
  });

  context("Minted freebet", () => {
    async function mint() {
      await freebet.connect(maintainer).mint(adr1.address, newBet);
    }

    wrapLayer(mint);

    it("Should mint successfully", async () => {
      expect(await freebet.balanceOf(adr1.address)).to.eq(1);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount);
      await expect(freebet.connect(maintainer).mint(adr1.address, newBet2))
        .to.emit(freebet, "FreeBetMinted")
        .withArgs(adr1.address, 2, [newBet2.amount, newBet2.minOdds, newBet2.durationTime]);
      expect(await freebet.balanceOf(adr1.address)).to.eq(2);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount.add(newBet2.amount));
      await expectTuple(await freebet.freeBets(2), newBet2.amount, newBet2.minOdds, newBet2.durationTime);
      expect(await freebet.expirationTime(2)).to.be.closeTo(newBet2.durationTime.add(now), 1000);
    });

    it("Should mint batch", async () => {
      expect(await freebet.balanceOf(adr1.address)).to.eq(1);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount);
      await expect(
        freebet.connect(maintainer).mintBatch([adr1.address, adr2.address, adr3.address], [newBet, newBet2, newBet2])
      ).to.emit(freebet, "FreeBetMintedBatch");
      await expectTuple(await freebet.freeBets(2), newBet.amount, newBet.minOdds, newBet.durationTime);
      await expectTuple(await freebet.freeBets(3), newBet2.amount, newBet2.minOdds, newBet2.durationTime);
      await expectTuple(await freebet.freeBets(4), newBet2.amount, newBet2.minOdds, newBet2.durationTime);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount.mul(2).add(newBet2.amount.mul(2)));
      expect(await freebet.balanceOf(adr1.address)).to.eq(2);
    });

    it("Should only burn expired bets", async () => {
      await freebet
        .connect(maintainer)
        .mintBatch([adr1.address, adr2.address, adr3.address], [newBet, newBet2, newBet2]);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount.mul(2).add(newBet2.amount.mul(2)));

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
      expect(await freebet.lockedReserve()).to.eq(newBet.amount.mul(2));
    });

    it("Can't be transferred", async () => {
      await expect(freebet.connect(adr1).transferFrom(adr1.address, owner.address, 1)).to.be.revertedWith(
        "NonTransferable"
      );
    });

    it("Should redeem correct freebet", async () => {
      const expectedOdds = await core.calculateOdds(1, tokens(50), 1);
      expect(await freebet.lockedReserve()).to.eq(newBet.amount);
      await expectTuple(await freebet.freeBets(1), newBet.amount, newBet.minOdds, newBet.durationTime);
      await expectTuple(await freebet.azuroBets(1), ethers.constants.AddressZero, 0, 0, 0);
      const tx = freebet.connect(adr1).redeem(1, condId1, tokens(50), 1, now + ONE_HOUR, odds("1.5"));

      await expect(tx).to.emit(freebet, "FreeBetRedeemed").withArgs(adr1.address, 1, 1, tokens(50));

      await expect(tx)
        .to.emit(lp, "NewBet")
        .withArgs(freebet.address, 1, 1, 1, tokens(50), expectedOdds, tokens(10050), tokens(10000));

      await expect(tx).to.emit(wxDAI, "Transfer").withArgs(freebet.address, lp.address, tokens(50));

      await expectTuple(
        await freebet.freeBets(1),
        newBet.amount.sub(tokensBN("50")),
        newBet.minOdds,
        newBet.durationTime
      );
      await expectTuple(await freebet.azuroBets(1), adr1.address, 1, tokensBN("50"), 0);

      expect(await freebet.lockedReserve()).to.eq(newBet.amount.sub(tokens(50)));
    });

    it("Shouldn't redeem expired freebet", async () => {
      await timeShiftBy(ethers, ONE_WEEK + 60);
      await expect(
        freebet.connect(adr1).redeem(1, condId1, tokens(50), 1, now + ONE_HOUR, odds("1.5"))
      ).to.be.revertedWith("BetExpired");
    });

    it("Should revert redeem of not owned freebet", async () => {
      await expect(
        freebet.connect(adr2).redeem(1, condId1, tokens(50), 1, now + ONE_HOUR, odds("1.5"))
      ).to.be.revertedWith("OnlyBetOwner");
    });

    it("Should revert withdraw if requested tokens are locked", async () => {
      await expect(freebet.connect(maintainer).withdrawReserve(tokens(1000))).to.be.revertedWith(
        "InsufficientContractBalance"
      );
      expect(await wxDAI.balanceOf(freebet.address)).to.eq(tokens(1000));
    });

    it("Should let withdraw unlocked tokens", async () => {
      await freebet.connect(maintainer).withdrawReserve(tokens(900));
      await timeShiftBy(ethers, ONE_WEEK + 60);
      const [ids, length] = await freebet.getExpiredUnburned(0, 100);
      await freebet.burnExpired(ids.slice(0, length));
      await freebet.connect(maintainer).withdrawReserve(tokens(100));
      expect(await wxDAI.balanceOf(freebet.address)).to.eq(0);
    });

    context("Redeemed on 1 outcome", () => {
      let odds1 = 1895801649;
      let betAmount;

      async function redeem() {
        betAmount = newBet.amount;
        await freebet.connect(adr1).redeem(1, condId1, betAmount, 1, now + ONE_HOUR, odds("1.5"));
      }

      wrapLayer(redeem);

      context("Win", () => {
        let payout;

        async function win() {
          payout = betAmount.mul(odds1).div(1e9);
          await timeShiftBy(ethers, ONE_HOUR * 2);
          await core.connect(oracle).resolveCondition(oracleCondId1, 1);
        }

        wrapLayer(win);

        it("Should resolve payout by any user and burn freebet", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          const tx = freebet.connect(adr2).resolvePayout(1);

          await expect(tx).to.emit(freebet, "Transfer").withArgs(adr1.address, constants.AddressZero, 1);
          await expect(tx).to.emit(lp, "BetterWin").withArgs(freebet.address, 1, payout);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(lp.address, freebet.address, payout);
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, payout.sub(betAmount));

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
        });

        it("Should Withdraw payout after resolve", async () => {
          await freebet.connect(adr2).resolvePayout(1);

          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, payout.sub(betAmount));
          const tx = freebet.connect(adr1).withdrawPayout(1);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(freebet.address, adr1.address, payout.sub(betAmount));
          await expect(tx).to.emit(freebet, "BettorWin").withArgs(adr1.address, 1, payout.sub(betAmount));
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
        });

        it("Should Withdraw payout in native after resolve", async () => {
          await freebet.connect(adr2).resolvePayout(1);

          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, payout.sub(betAmount));
          const balanceNativeBefore = await adr1.getBalance();
          const tx = await freebet.connect(adr1).withdrawPayoutNative(1);
          await expect(tx).to.emit(freebet, "BettorWin").withArgs(adr1.address, 1, payout.sub(betAmount));
          const res = await tx.wait();
          expect(await adr1.getBalance()).to.eq(balanceNativeBefore.add(payout.sub(betAmount)).sub(calcGas(res)));
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
        });

        it("Should resolve and withdraw by calling withdraw", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          const tx = freebet.connect(adr1).withdrawPayout(1);
          await expect(tx).to.emit(freebet, "Transfer").withArgs(adr1.address, constants.AddressZero, 1);
          await expect(tx).to.emit(lp, "BetterWin").withArgs(freebet.address, 1, payout);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(lp.address, freebet.address, payout);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(freebet.address, adr1.address, payout.sub(betAmount));
          await expect(tx).to.emit(freebet, "BettorWin").withArgs(adr1.address, 1, payout.sub(betAmount));
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
        });

        it("Should revert withdraw payout of not owned Azuro bet", async () => {
          await expect(freebet.connect(adr2).withdrawPayout(1)).to.be.revertedWith("OnlyBetOwner");
        });
      });

      context("Lose", () => {
        async function lose() {
          await timeShiftBy(ethers, ONE_HOUR * 2);
          await core.connect(oracle).resolveCondition(oracleCondId1, 2);
        }

        wrapLayer(lose);

        it("Should resolve 0 payout and burn freebet", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          const tx = freebet.connect(adr2).resolvePayout(1);

          await expect(tx).to.emit(freebet, "Transfer").withArgs(adr1.address, constants.AddressZero, 1);
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
        });

        it("Should withdraw 0 payout and burn freebet", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          const tx = freebet.connect(adr1).withdrawPayout(1);

          await expect(tx).to.emit(freebet, "Transfer").withArgs(adr1.address, constants.AddressZero, 1);
          await expect(tx).to.not.emit(freebet, "BettorWin");
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
        });
      });

      context("Cancel", () => {
        async function cancel() {
          await timeShiftBy(ethers, ONE_HOUR * 2);
          await core.connect(oracle).cancelByOracle(oracleCondId1);
        }

        wrapLayer(cancel);

        it("Should reissue freebet on resolve", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          await expectTuple(await freebet.freeBets(1), 0, newBet.minOdds, newBet.durationTime);
          expect(await freebet.lockedReserve()).to.eq(0);

          const tx = freebet.connect(adr2).resolvePayout(1);

          await expect(tx).to.emit(lp, "BetterWin").withArgs(freebet.address, 1, betAmount);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(lp.address, freebet.address, betAmount);
          await expect(tx)
            .to.emit(freebet, "FreeBetReissued")
            .withArgs(adr1.address, 1, [newBet.amount, newBet.minOdds, newBet.durationTime]);

          await expectTuple(await freebet.freeBets(1), newBet.amount, newBet.minOdds, newBet.durationTime);
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);
          expect(await freebet.expirationTime(1)).to.be.closeTo(
            newBet.durationTime.add(await getBlockTime(ethers)),
            1000
          );
          expect(await freebet.lockedReserve()).to.eq(newBet.amount);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
        });

        it("Should Withdraw payout after resolve", async () => {
          await freebet.connect(adr2).resolvePayout(1);

          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);
          const tx = freebet.connect(adr1).withdrawPayout(1);
          await expect(tx).to.not.emit(wxDAI, "Transfer");
          await expect(tx).to.not.emit(freebet, "BettorWin");
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);

          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
        });

        it("Should resolve and withdraw by calling withdraw", async () => {
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, newBet.amount, 0);
          expect(await freebet.lockedReserve()).to.eq(0);

          const tx = freebet.connect(adr1).withdrawPayout(1);

          await expect(tx).to.emit(lp, "BetterWin").withArgs(freebet.address, 1, betAmount);
          await expect(tx).to.emit(wxDAI, "Transfer").withArgs(lp.address, freebet.address, betAmount);
          await expect(tx)
            .to.emit(freebet, "FreeBetReissued")
            .withArgs(adr1.address, 1, [newBet.amount, newBet.minOdds, newBet.durationTime]);
          await expect(tx).to.not.emit(freebet, "BettorWin");
          await expectTuple(await freebet.azuroBets(1), adr1.address, 1, 0, 0);
          expect(await freebet.expirationTime(1)).to.be.closeTo(
            newBet.durationTime.add(await getBlockTime(ethers)),
            1000
          );
          expect(await freebet.lockedReserve()).to.eq(newBet.amount);

          await expect(freebet.connect(adr1).withdrawPayout(1)).to.not.be.reverted;
          await expect(freebet.connect(adr2).resolvePayout(1)).to.be.revertedWith("AlreadyResolved");
        });
      });
    });
  });
});
