const fs = require("fs");
const path = require("path");

const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const {
  getBlockTime,
  timeShift,
  tokens,
  prepareStand,
  createCondition,
  makeBetGetTokenIdOdds,
} = require("../utils/utils");

const LIQUIDITY = tokens(2000000);
const REINFORCEMENT = tokens(20000);
const MARGIN = 90000000;
const MULTIPLIER = 1e9;
const BALANCE_DEST = 10000000;
const BALANCE = tokens(BALANCE_DEST);
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const SCOPE_ID = 1;

const ONE_HOUR = 3600;

const MIN_CONDITIONS = 3;
const MAX_CONDITIONS = 16;
const MIN_BETTORS = 3;
const MAX_BETTORS = 16;
const N_BETS = 1000;

const OUPUT_DIR = "./scripts/logs";

function dateTimeDirName() {
  const date = new Date();
  const datestring = [
    ("0" + date.getDate()).slice(-2),
    ("0" + (date.getMonth() + 1)).slice(-2),
    date.getFullYear(),
    ("0" + date.getHours()).slice(-2),
    ("0" + date.getMinutes()).slice(-2),
    ("0" + date.getSeconds()).slice(-2),
  ].join("-");

  return datestring;
}

function writeLog(dirname, filename, line) {
  const filepath = path.join(dirname, `${filename}.csv`);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
  fs.writeFile(
    filepath,
    line + "\n",
    {
      encoding: "ascii",
      flag: "a+",
      mode: 0o666,
    },
    (err) => {}
  );
}

const prepareBettors = async (lp, usdt, n) => {
  let bettors = [],
    bettor;
  [donor] = await ethers.getSigners();
  for (let k = 0; k < n; k++) {
    bettor = await ethers.Wallet.createRandom();
    bettor = bettor.connect(ethers.provider);

    //await usdt.connect(donor).transfer(bettor.address, BALANCE);
    //await usdt.mint(bettor.address, BALANCE);
    await donor.sendTransaction({ to: bettor.address, value: ethers.utils.parseEther("1") });
    await donor.sendTransaction({ to: bettor.address, value: ethers.utils.parseEther("10000000") });
    await bettor.sendTransaction({ to: usdt.address, value: ethers.utils.parseEther("10000000") });

    await usdt.connect(bettor).approve(lp.address, BALANCE);
    bettors.push(bettor);
  }
  return bettors;
};

async function main() {
  console.log("- Pre-configuration");

  let owner, addr1, oracle, oracle2, maintainer;
  let core, usdt, lp;

  [owner, addr1, oracle, oracle2, maintainer] = await ethers.getSigners();
  [core, _, usdt, lp] = await prepareStand(
    ethers,
    owner,
    addr1,
    oracle,
    oracle2,
    maintainer,
    REINFORCEMENT,
    MARGIN,
    LIQUIDITY
  );

  let nCondtions, nBettors, odds1, odds2, condIdHash;
  let condHashes,
    bettors = await prepareBettors(lp, usdt, MAX_BETTORS),
    tokenIds,
    tokenOwners;
  let condId = 0,
    bettor,
    balance,
    outcome,
    betAmount,
    time,
    tokenId,
    odds,
    line;

  nCondtions = Math.floor(Math.random() * (MAX_BETTORS - MIN_BETTORS + 1) + MIN_BETTORS);
  nBettors = Math.floor(Math.random() * (MAX_CONDITIONS - MIN_CONDITIONS + 1) + MIN_CONDITIONS);
  condHashes = [];
  odds = [];
  tokenIds = [];
  tokenOwners = {};

  const outputPath = path.join(OUPUT_DIR, dateTimeDirName());

  console.log("- Create conditions");

  writeLog(outputPath, "conditions", "condId;odds1;odds2");
  for (let k = 0; k < nCondtions; k++) {
    time = await getBlockTime(ethers);
    odds1 = Math.floor(Math.random() * 900000) + 100000;
    odds2 = Math.floor(Math.random() * 900000) + 100000;

    condId++;
    condIdHash = await createCondition(
      core,
      oracle,
      condId,
      SCOPE_ID,
      [odds1, odds2],
      [OUTCOMEWIN, OUTCOMELOSE],
      time + ONE_HOUR,
      "ipfs"
    );
    condHashes[condId] = condIdHash;
    line = [condId, odds1, odds2].join(";");
    writeLog(outputPath, "conditions", line);
  }

  console.log("- Make bets");

  writeLog(outputPath, "bets", "timestamp;address;balance;condId;outcome;betAmount;odds");
  let betAmounts = [tokens(100), tokens(1000), tokens(500), tokens(100)];
  let betAmountId = 0;
  for (let k = 0; k < N_BETS; k++) {
    bettor = bettors[Math.floor(Math.random() * nBettors)];
    condId = 1; //Math.floor(Math.random() * nCondtions) + 1;
    outcome = k % 2 == 0 ? OUTCOMEWIN : OUTCOMELOSE; //Math.random() > 1 / 2 ? OUTCOMEWIN : OUTCOMELOSE;
    betAmount = betAmounts[betAmountId];
    betAmountId = betAmountId == 3 ? 0 : betAmountId + 1;
    /* BigNumber.from(ethers.utils.randomBytes(Math.floor(Math.random() * 9) + 1)) // (2^8)^9 ~ 4722 * 10^18
      .add(MULTIPLIER); */
    balance = await usdt.balanceOf(bettor.address);
    time = await getBlockTime(ethers);
    [tokenId, odds] = await makeBetGetTokenIdOdds(lp, bettor, condHashes[condId], betAmount, outcome, time + 100, 0);
    if (outcome == OUTCOMEWIN) {
      tokenIds.push(tokenId);
      tokenOwners[tokenId] = bettor;
    }

    line = [time, bettor.address, balance, condId, outcome, betAmount, odds].join(";");
    writeLog(outputPath, "bets", line);
  }

  console.log("- Resolve conditions");

  await timeShift(time + ONE_HOUR);

  for (let condId = 1; condId <= nCondtions; condId++) {
    await core.connect(oracle).resolveCondition(condId, OUTCOMEWIN);
  }

  console.log("- Withdraw payouts");

  for (let k = 0; k < tokenIds.length; k++) {
    tokenId = tokenIds[k];
    await lp.connect(tokenOwners[tokenId]).withdrawPayout(tokenId);
  }

  writeLog(outputPath, "balances", "address;balance");
  for (let k = 0; k < nBettors; k++) {
    bettor = bettors[k];
    balance = await usdt.balanceOf(bettor.address);
    line = [bettor.address, balance].join(";");
    writeLog(outputPath, "balances", line);
  }

  console.log("OK");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
