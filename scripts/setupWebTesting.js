const hre = require("hardhat");
const ethers = require("ethers");
const pinataSDK = require("@pinata/sdk");

const pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET);

let scopeId = parseInt(String(+new Date() / 1000)) + 1;
let conditionId = +new Date() + 1;

const gamesData = [
  {
    scopeId: ++scopeId,
    gameId: ++scopeId,
    sportTypeId: 33,
    titleCountry: "England",
    titleLeague: "Championship - Round 24",
    entity1Name: "Sheffield United",
    entity1Image: "https://content.bookieratings.net/images/ae/e6/aee62w_20181001112131_100x100.png",
    entity2Name: "Hull City",
    entity2Image: "https://content.bookieratings.net/images/a7/fe/a7fely_20181001112732_100x100.png",
  },
  {
    scopeId: ++scopeId,
    gameId: ++scopeId,
    sportTypeId: 33,
    titleCountry: "England",
    titleLeague: "Championship - Round 24",
    entity1Name: "Millwall",
    entity1Image: "https://content.bookieratings.net/images/7e/bd/7ebdth_20181001112325_100x100.png",
    entity2Name: "Queens Park Rangers",
    entity2Image: "https://content.bookieratings.net/images/d1/xd/d1xd9l_20181001112113_100x100.png",
  },
  {
    scopeId: ++scopeId,
    gameId: ++scopeId,
    sportTypeId: 33,
    titleCountry: "England",
    titleLeague: "Championship - Round 25",
    entity1Name: "Cardiff City",
    entity1Image: "https://content.bookieratings.net/images/5j/ed/5jedgw_20181001112631_100x100.png",
    entity2Name: "Coventry City",
    entity2Image: "https://content.bookieratings.net/images/8o/mn/8omngq_20181001112116_100x100.png",
  },
  {
    scopeId: ++scopeId,
    gameId: ++scopeId,
    sportTypeId: 33,
    titleCountry: "World",
    titleLeague: "UEFA Champions League - 1/8 final",
    entity1Name: "Sporting",
    entity1Image: "https://content.bookieratings.net/images/f5/6u/f56u6n_20181001112403_100x100.png",
    entity2Name: "Manchester City",
    entity2Image: "https://content.bookieratings.net/images/f9/lr/f9lrgs_20181001112151_100x100.png",
  },
];

const pinIPFSData = async (data) => {
  const { IpfsHash, Timestamp } = await pinata.pinJSONToIPFS(data);

  return IpfsHash;
};

const setupIPFSData = async () => {
  try {
    const result = await Promise.all(gamesData.map(pinIPFSData));
    const mHashes = result.map((hash) => {
      return ethers.utils.hexlify(ethers.utils.base58.decode(hash).slice(2));
    });
    console.log("IPFS hashes: ", result);
    console.log("IPFS mHashes: ", mHashes);
    return mHashes;
  } catch (err) {
    console.error(err);
    throw new Error("Setup IPFS failed");
  }
};

async function main() {
  const ipfsHashes = await setupIPFSData();

  for (const [index] of gamesData.entries()) {
    const values = {
      id: conditionId++,
      ipfs: ipfsHashes[index],
      outcome1: 1,
      outcome2: 2,
      timestamp: Math.floor(Date.now() / 1000) + 3 * 60 * 60, // 3 min
    };

    await hre.run("create-condition", values);
    console.log("Condition created:", values);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
