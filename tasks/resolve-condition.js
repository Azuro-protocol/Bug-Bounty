const { getTestCoreOwner } = require("../utils/utils");
task("resolve-condition", "Indicate outcome as happened in oracle's condition")
  .addParam("id", "The match or game ID in oracle's internal system", 1000002, types.int)
  .addParam("outcome", "ID of happened outcome", 1, types.int)
  .setAction(async (args, hre) => {
    const [core, owner] = await getTestCoreOwner(hre);

    await core.connect(owner).resolveCondition(args.id, args.outcome);
  });
