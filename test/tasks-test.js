const hre = require("hardhat");
const os = require("os");
const { expect } = require("chai");
const { spawn, execSync } = require("child_process");
const { getBlockTime, timeShift, getTestCoreOwner } = require("../utils/utils");

const SCOPE = 10;
const ODDS1 = 7500000;
const ODDS2 = 2500000;
const OUTCOMEWIN = 1;
const OUTCOMELOSE = 2;
const IPFS = "0x" + "0".repeat(64);

const ONE_HOUR = 3600;
const ONE_MINUTE = 60;

describe("Tasks test", function () {
  this.timeout(120000);
  let node, time;
  let core;
  let conditionId = 0,
    conditionIds = [];

  before(async function () {
    // 1. Run local node
    node = spawn("npm", ["run", "node"], { shell: true });

    // 2. Deploy contracts locally
    process.env["ORACLES"] = "[]";
    process.env["MAINTAINERS"] = "[]";
    const deploy = execSync("npm run deploy-local", { encoding: "utf-8", stdio: "pipe" });

    // 3. Set environment variables
    const re = new RegExp("CORE: (0[xX][0-9a-fA-F]+)");
    const coreAddress = re.exec(deploy)[1];
    process.env["CORE_ADDRESS"] = coreAddress;

    // 4. Run tasks
    hre.changeNetwork("localhost");
    time = await getBlockTime(ethers);
    [core, _] = await getTestCoreOwner(hre);
  });

  after(async function () {
    // Terminate node
    try {
      if (os.platform() === "win32") {
        execSync("taskkill /pid " + node.pid + " /T /F");
      } else {
        node.kill();
      }
    } catch {}
  });

  it("create-condition", async () => {
    const timestamp = time + ONE_HOUR;
    for (const x of Array(5).keys()) {
      const conditionParams = {
        id: ++conditionId,
        scope: SCOPE,
        odds1: ODDS1,
        odds2: ODDS2,
        outcome1: OUTCOMEWIN,
        outcome2: OUTCOMELOSE,
        timestamp: timestamp,
        ipfs: IPFS,
      };

      await hre.run("create-condition", conditionParams);
      const condition = await core.getCondition(conditionId);

      expect(condition.scopeId).to.be.equal(SCOPE);
      expect(condition.outcomes[0]).to.be.equal(OUTCOMEWIN);
      expect(condition.outcomes[1]).to.be.equal(OUTCOMELOSE);
      expect(condition.timestamp).to.be.equal(timestamp);
      expect(condition.ipfsHash).to.be.equal(IPFS);

      const reinforcement = await core.getReinforcement(OUTCOMEWIN);
      const oddsSum = ODDS1 + ODDS2;
      expect(condition.fundBank[0]).to.be.equal(reinforcement.mul(ODDS2).div(oddsSum));
      expect(condition.fundBank[1]).to.be.equal(reinforcement.mul(ODDS1).div(oddsSum));

      conditionIds.push(conditionId);
    }
  });

  it("cancel-condition", async () => {
    conditionId = conditionIds.pop();

    await hre.run("cancel-condition", { id: conditionId });
    await expect(core.cancelByOracle(conditionId)).to.be.revertedWith("ConditionAlreadyResolved");
  });

  it("resolve-condition", async () => {
    conditionId = conditionIds.pop();

    timeShift(time + ONE_HOUR + ONE_MINUTE);
    await hre.run("resolve-condition", { id: conditionId, outcome: OUTCOMEWIN });
    await expect(core.resolveCondition(conditionId, OUTCOMEWIN)).to.be.revertedWith("ConditionAlreadyResolved");
  });

  it("time-shift", async () => {
    conditionId = conditionIds.pop();

    await hre.run("time-shift", { timestamp: time + ONE_HOUR + ONE_MINUTE });
    await hre.run("resolve-condition", { id: conditionId, outcome: OUTCOMEWIN });
    await expect(core.resolveCondition(conditionId, OUTCOMEWIN)).to.be.revertedWith("ConditionAlreadyResolved");
  });

  it("stop-conditions", async () => {
    conditionId = conditionIds.pop();

    await hre.run("stop-conditions", { id: conditionId });
    await expect(core.stopCondition(conditionId, true)).to.be.revertedWith("CantChangeFlag");

    await hre.run("stop-conditions");
    await expect(core.stopAllConditions(true)).to.be.revertedWith("FlagAlreadySet");

    await core.stopAllConditions(false);
  });

  it("resume-conditions", async () => {
    conditionId = conditionIds.pop();

    await core.stopCondition(conditionId, true);
    await hre.run("resume-conditions", { id: conditionId });
    await expect(core.stopCondition(conditionId, false)).to.be.revertedWith("CantChangeFlag");

    await core.stopAllConditions(true);
    await hre.run("resume-conditions");
    await expect(core.stopAllConditions(false)).to.be.revertedWith("FlagAlreadySet");
  });
});
