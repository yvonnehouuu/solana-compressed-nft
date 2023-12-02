const { Keypair, LAMPORTS_PER_SOL, clusterApiUrl, Connection, Transaction } = require("@solana/web3.js");
const { MetadataArgs, TokenProgramVersion, TokenStandard } = require("@metaplex-foundation/mpl-bubblegum");
// Import custom helpers for demos
const { loadKeypairFromFile, loadOrGenerateKeypair, numberFormatter } = require("../utils/helpers");
// Import custom helpers to mint compressed NFTs
const { createCollection, createTree, mintCompressedNFT } = require("../utils/compression");
// ReadApi connection
const { WrapperConnection } = require("../ReadApi/WrapperConnection");
const bs58 = require('bs58');
const dotenv = require("dotenv");
dotenv.config();

// load the env variables and store the cluster RPC url
const CLUSTER_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");

// create a new rpc connection, using the ReadApi wrapper
const connection = new WrapperConnection(CLUSTER_URL, "confirmed");

let initBalance, balance;

async function connectWallet() {
    const payerSecret = process.env.PRIVATE_KEY;
    const testWalletSecret = process.env.PRIVATE_KEY_TEST;

    const payerSecretKey = bs58.decode(payerSecret);
    const testWalletSecretKey = bs58.decode(testWalletSecret);

    // const payer = Keypair.fromSecretKey(payerSecretKey) 
    const payer = Keypair.fromSecretKey(payerSecretKey);
    const testWallet = Keypair.fromSecretKey(testWalletSecretKey);
    // console.log(payer)

    // console.log("PublicKey:", payer.publicKey.toBase58())
    // console.log("PublicKey_test:", testWallet.publicKey.toBase58())

    return [payer, testWallet]
}

async function createMerkleTree(payer) {
    const maxDepthSizePair = {
        maxDepth: 3, // max=2^3 nodes
        maxBufferSize: 8,
    };
    const canopyDepth = maxDepthSizePair.maxDepth - 5;

    /*
      Actually allocate the tree on chain
    */

    // Define the address the tree will live at
    const treeKeypair = Keypair.generate();

    // Create and send the transaction to create the tree on chain
    const tree = await createTree(connection, payer, treeKeypair, maxDepthSizePair, canopyDepth);

    return treeKeypair
}

async function createCollectionNFT(payer) {
    // Define the metadata to be used for creating the NFT collection
    const collectionMetadataV3 = {
        data: {
            name: "Super Sweet NFT Collection 111",
            symbol: "SSNC111",
            uri: "https://supersweetcollection.notarealurl/collection.json",
            sellerFeeBasisPoints: 100,
            creators: [
                {
                    address: payer.publicKey,
                    verified: false,
                    share: 100,
                },
            ],
            collection: null,
            uses: null,
        },
        isMutable: false,
        collectionDetails: null,
    };

    // Create a full token mint and initialize the collection (with the `payer` as the authority)
    const collection = await createCollection(connection, payer, collectionMetadataV3);

    return [collection, collectionMetadataV3]
}

async function mintSingleCNFT(payer, testWallet, treeKeypair, collection, collectionMetadataV3) {
    const compressedNFTMetadata = {
        name: "NFT Name 111",
        symbol: collectionMetadataV3.data.symbol,
        uri: "https://supersweetcollection.notarealurl/token.json",
        creators: [
            {
                address: payer.publicKey,
                verified: false,
                share: 100,
            },
            {
                address: testWallet.publicKey,
                verified: false,
                share: 0,
            },
        ],
        editionNonce: 0,
        uses: null,
        collection: null,
        primarySaleHappened: false,
        sellerFeeBasisPoints: 0,
        isMutable: false,
        tokenProgramVersion: TokenProgramVersion.Original,
        tokenStandard: TokenStandard.NonFungible,
    };

    // Fully mint a single compressed NFT to the payer
    console.log(`Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`);

    await mintCompressedNFT(
        connection,
        payer,
        treeKeypair.publicKey,
        collection.mint,
        collection.metadataAccount,
        collection.masterEditionAccount,
        compressedNFTMetadata,
        payer.publicKey,
    );

    // Fully mint a single compressed NFT
    console.log(`Minting a single compressed NFT to ${testWallet.publicKey.toBase58()}...`);

    await mintCompressedNFT(
        connection,
        payer,
        treeKeypair.publicKey,
        collection.mint,
        collection.metadataAccount,
        collection.masterEditionAccount,
        compressedNFTMetadata,
        testWallet.publicKey,
    );
}


async function createAndMint() {
    // connect wallet
    const [payer, testWallet] = await connectWallet()
    // console.log(payer.publicKey.toBase58(), testWallet.publicKey.toBase58())

    // Get the payer's starting balance (only used for demonstration purposes)
    initBalance = await connection.getBalance(payer.publicKey);

    /*
      Define our tree size parameters
    */
    console.log('create merkle tree...')
    const treeKeypair = await createMerkleTree(payer)
    console.log('create complete')

    /*
      Create the actual NFT collection (using the normal Metaplex method)
      (nothing special about compression here)
    */
    console.log('create collection...')
    // const re = await createCollectionNFT(payer)
    const [collection, collectionMetadataV3] = await createCollectionNFT(payer)
    // const collection = re[0]
    // const collectionMetadataV3 = re[1]
    console.log('create complete')

    /*
      Mint a single compressed NFT
    */
    await mintSingleCNFT(payer, testWallet, treeKeypair, collection, collectionMetadataV3)

    //////////////////////////////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////

    // Fetch the payer's final balance
    balance = await connection.getBalance(payer.publicKey);

    console.log(`===============================`);
    console.log(
        "Total cost:",
        numberFormatter((initBalance - balance) / LAMPORTS_PER_SOL, true),
        "SOL\n",
    );
}

module.exports = { createAndMint }