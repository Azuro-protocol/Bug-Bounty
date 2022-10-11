const { getTestCoreOwner } = require("../utils/utils");
task("cancel-condition", "Indicate the condition as canceled")
  .addParam("id", "The match or game ID in oracle's internal system", 1000002, types.int)
  .setAction(async (args, hre) => {
    const [core, owner] = await getTestCoreOwner(hre);

    await core.connect(owner).cancelByOracle(args.id);
  });
