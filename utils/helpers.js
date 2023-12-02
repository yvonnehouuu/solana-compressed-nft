const fs = require("fs");
const path = require("path");
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require("@solana/web3.js");

// Define some default locations
const DEFAULT_KEY_DIR_NAME = ".local_keys";
const DEFAULT_PUBLIC_KEY_FILE = "keys.json";
const DEFAULT_DEMO_DATA_FILE = "demo.json";

/*
  Load locally stored PublicKey addresses
*/
function loadPublicKeysFromFile(absPath = `${DEFAULT_KEY_DIR_NAME}/${DEFAULT_PUBLIC_KEY_FILE}`) {
  try {
    if (!absPath) throw Error("No path provided");
    if (!fs.existsSync(absPath)) throw Error("File does not exist.");

    // Load the public keys from the file
    const data = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" })) || {};

    // Convert all loaded keyed values into valid public keys
    for (const [key, value] of Object.entries(data)) {
      data[key] = new PublicKey(value) || "";
    }

    return data;
  } catch (err) {
    // console.warn("Unable to load local file");
  }
  // Always return an object
  return {};
}

/*
  Locally save demo data to the filesystem for later retrieval
*/
function saveDemoDataToFile(name, newData, absPath = `${DEFAULT_KEY_DIR_NAME}/${DEFAULT_DEMO_DATA_FILE}`) {
  try {
    let data = {};

    // Fetch all the current values when the storage file exists
    if (fs.existsSync(absPath))
      data = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" })) || {};

    data = { ...data, [name]: newData };

    // Actually save the data to the file
    fs.writeFileSync(absPath, JSON.stringify(data), {
      encoding: "utf-8",
    });

    return data;
  } catch (err) {
    console.warn("Unable to save to file");
    // console.warn(err);
  }

  // Always return an object
  return {};
}

/*
  Locally save a PublicKey addresses to the filesystem for later retrieval
*/
function savePublicKeyToFile(name, publicKey, absPath = `${DEFAULT_KEY_DIR_NAME}/${DEFAULT_PUBLIC_KEY_FILE}`) {
  try {
    // Fetch all the current values
    let data = loadPublicKeysFromFile(absPath);

    // Convert all loaded keyed values from PublicKeys to strings
    for (const [key, value] of Object.entries(data)) {
      data[key] = value.toBase58();
    }
    data = { ...data, [name]: publicKey.toBase58() };

    // Actually save the data to the file
    fs.writeFileSync(absPath, JSON.stringify(data), {
      encoding: "utf-8",
    });

    // Reload the keys for sanity
    data = loadPublicKeysFromFile(absPath);

    return data;
  } catch (err) {
    console.warn("Unable to save to file");
  }
  // Always return an object
  return {};
}

/*
  Load a locally stored JSON keypair file and convert it to a valid Keypair
*/
function loadKeypairFromFile(absPath) {
  try {
    if (!absPath) throw Error("No path provided");
    if (!fs.existsSync(absPath)) throw Error("File does not exist.");

    // Load the keypair from the file
    const keyfileBytes = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" }));
    // Parse the loaded secretKey into a valid keypair
    const keypair = Keypair.fromSecretKey(new Uint8Array(keyfileBytes));
    return keypair;
  } catch (err) {
    // return false;
    throw err;
  }
}

/*
  Save a locally stored JSON keypair file for later importing
*/
function saveKeypairToFile(keypair, fileName, dirName = DEFAULT_KEY_DIR_NAME) {
  fileName = path.join(dirName, `${fileName}.json`);

  // Create the `dirName` directory, if it does not exist
  if (!fs.existsSync(`./${dirName}/`)) fs.mkdirSync(`./${dirName}/`);

  // Remove the current file if it already exists
  if (fs.existsSync(fileName)) fs.unlinkSync(fileName);

  // Write the `secretKey` value as a string
  fs.writeFileSync(fileName, `[${keypair.secretKey.toString()}]`, {
    encoding: "utf-8",
  });

  return fileName;
}

/*
  Attempt to load a keypair from the filesystem or generate and save a new one
*/
function loadOrGenerateKeypair(fileName, dirName = DEFAULT_KEY_DIR_NAME) {
  try {
    // Compute the path to locate the file
    const searchPath = path.join(dirName, `${fileName}.json`);
    let keypair = Keypair.generate();

    // Attempt to load the keypair from the file
    if (fs.existsSync(searchPath)) keypair = loadKeypairFromFile(searchPath);
    // When unable to locate the keypair, save the new one
    else saveKeypairToFile(keypair, fileName, dirName);

    return keypair;
  } catch (err) {
    console.error("loadOrGenerateKeypair:", err);
    throw err;
  }
}

/*
  Compute the Solana explorer address for the various data
*/
function explorerURL({ address, txSignature, cluster }) {
  let baseUrl;
  //
  if (address) baseUrl = `https://explorer.solana.com/address/${address}`;
  else if (txSignature) baseUrl = `https://explorer.solana.com/tx/${txSignature}`;
  else return "[unknown]";

  // Auto-append the desired search params
  const url = new URL(baseUrl);
  url.searchParams.append("cluster", cluster || "devnet");
  return url.toString() + "\n";
}

/**
 * Auto airdrop the given wallet of a balance of < 0.5 SOL
 */
async function airdropOnLowBalance(connection, keypair, forceAirdrop = false) {
  // Get the current balance
  let balance = await connection.getBalance(keypair.publicKey);

  // Define the low balance threshold before airdrop
  const MIN_BALANCE_TO_AIRDROP = LAMPORTS_PER_SOL / 2; // current: 0.5 SOL

  // Check the balance of the two accounts, airdrop when low
  if (forceAirdrop === true || balance < MIN_BALANCE_TO_AIRDROP) {
    console.log(`Requesting airdrop of 1 SOL to ${keypair.publicKey.toBase58()}...`);
    await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL).then((sig) => {
      console.log("Tx signature:", sig);
      // balance = balance + LAMPORTS_PER_SOL;
    });

    // Fetch the new balance
    // const newBalance = await connection.getBalance(keypair.publicKey);
    // return newBalance;
  }
  // else console.log("Balance of:", balance / LAMPORTS_PER_SOL, "SOL");

  return balance;
}

/*
  Helper function to extract a transaction signature from a failed transaction's error message
*/
async function extractSignatureFromFailedTransaction(connection, err, fetchLogs) {
  if (err?.signature) return err.signature;

  // Extract the failed transaction's signature
  const failedSig = new RegExp(/^((.*)?Error: )?(Transaction|Signature) ([A-Z0-9]{32,}) /gim).exec(
    err?.message?.toString(),
  )?.[4];

  // Ensure a signature was found
  if (failedSig) {
    // When desired, attempt to fetch the program logs from the cluster
    if (fetchLogs)
      await connection
        .getTransaction(failedSig, {
          maxSupportedTransactionVersion: 0,
        })
        .then((tx) => {
          console.log(`\n==== Transaction logs for ${failedSig} ====`);
          console.log(explorerURL({ txSignature: failedSig }), "");
          console.log(tx?.meta?.logMessages ?? "No log messages provided by RPC");
          console.log(`==== END LOGS ====\n`);
        });
    else {
      console.log("\n========================================");
      console.log(explorerURL({ txSignature: failedSig }));
      console.log("========================================\n");
    }
  }

  // Always return the failed signature value
  return failedSig;
}

/*
  Standard number formatter
*/
function numberFormatter(num, forceDecimals = false) {
  // Set the significant figures
  const minimumFractionDigits = num < 1 || forceDecimals ? 10 : 2;

  // Do the formatting
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits,
  }).format(num);
}

/*
  Display a separator in the console, with or without a message
*/
function printConsoleSeparator(message) {
  console.log("\n===============================================");
  console.log("===============================================\n");
  if (message) console.log(message);
}

module.exports = {
  loadPublicKeysFromFile,
  saveDemoDataToFile,
  savePublicKeyToFile,
  loadKeypairFromFile,
  explorerURL,
  airdropOnLowBalance,
  extractSignatureFromFailedTransaction,
  numberFormatter,
  printConsoleSeparator,
  loadOrGenerateKeypair
};
