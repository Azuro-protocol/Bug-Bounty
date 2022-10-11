const { getTestCoreOwner, getBlockTime, createCondition } = require("../utils/utils");

task("create-condition", "Creates condition")
  .addParam("id", "The match or game ID in oracle's internal system", 1000002, types.int)
  .addOptionalParam(
    "scope",
    "ID of the competition or event the condition belongs. If 0 set the parameter as current timestamp",
    0,
    types.int
  )
  .addOptionalParam("odds1", "Start odds for team 1", 5000000, types.int)
  .addOptionalParam("odds2", "Start odds for team 2", 5000000, types.int)
  .addParam("outcome1", "Unique outcome for the condition", 1, types.int)
  .addParam("outcome2", "Unique outcome for the condition", 2, types.int)
  .addOptionalParam(
    "timestamp",
    "Time when match starts and bets stopped accepts. If 0 set the parameter as current timestamp + one hour",
    0,
    types.int
  )
  .addParam("ipfs", "Detailed info about match stored in IPFS")
  .setAction(async (args, hre) => {
    const [core, owner] = await getTestCoreOwner(hre);
    const now = await getBlockTime(hre.ethers);
    const condId = await createCondition(
      core,
      owner,
      args.id,
      args.scope != 0 ? args.scope : now,
      [args.odds1, args.odds2],
      [args.outcome1, args.outcome2],
      args.timestamp != 0 ? args.timestamp : now + 3600,
      args.ipfs
    );
    if (args.verbose) {
      console.log("condition %d created", condId);
    }
  });
