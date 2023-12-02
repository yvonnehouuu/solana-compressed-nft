const {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    sendAndConfirmTransaction,
    TransactionInstruction,
} = require("@solana/web3.js");

const {
    createAccount,
    createMint,
    mintTo,
    TOKEN_PROGRAM_ID
} = require("@solana/spl-token");

const {
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    createAllocTreeIx,
    ValidDepthSizePair,
    SPL_NOOP_PROGRAM_ID
} = require("@solana/spl-account-compression");

const {
    computeCreatorHash,
    computeDataHash,
    createCreateTreeInstruction,
    createMintToCollectionV1Instruction,
} = require("@metaplex-foundation/mpl-bubblegum");

const {
    createCreateMetadataAccountV3Instruction,
    createCreateMasterEditionV3Instruction,
    createSetCollectionSizeInstruction,
} = require("@metaplex-foundation/mpl-token-metadata");

const { explorerURL, extractSignatureFromFailedTransaction } = require('./helpers');

let BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY')
let TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

async function createTree(
    connection,
    payer,
    treeKeypair,
    maxDepthSizePair,
    canopyDepth = 0
) {
    console.log("Creating a new Merkle tree...");
    console.log("treeAddress:", treeKeypair.publicKey.toBase58());

    console.log('BUBBLEGUM_PROGRAM_ID:', BUBBLEGUM_PROGRAM_ID)

    const [treeAuthority, _bump] = PublicKey.findProgramAddressSync(
        [treeKeypair.publicKey.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
    );
    console.log("treeAuthority:", treeAuthority.toBase58());

    const allocTreeIx = await createAllocTreeIx(
        connection,
        treeKeypair.publicKey,
        payer.publicKey,
        maxDepthSizePair,
        canopyDepth
    );

    const createTreeIx = createCreateTreeInstruction(
        {
            payer: payer.publicKey,
            treeCreator: payer.publicKey,
            treeAuthority,
            merkleTree: treeKeypair.publicKey,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            logWrapper: SPL_NOOP_PROGRAM_ID,
        },
        {
            maxBufferSize: maxDepthSizePair.maxBufferSize,
            maxDepth: maxDepthSizePair.maxDepth,
            public: false,
        },
        BUBBLEGUM_PROGRAM_ID
    );

    try {
        const tx = new Transaction().add(allocTreeIx).add(createTreeIx);
        tx.feePayer = payer.publicKey;
        const blockhash = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash.blockhash

        console.log(connection)

        const txSignature = await sendAndConfirmTransaction(
            connection,
            tx,
            [treeKeypair, payer],
            {
                commitment: "confirmed",
                skipPreflight: false,
            }
        );

        console.log("\nMerkle tree created successfully!");
        console.log(explorerURL({ txSignature }));

        return { treeAuthority, treeAddress: treeKeypair.publicKey };
    } catch (err) {
        console.error("\nFailed to create merkle tree:", err);

        await extractSignatureFromFailedTransaction(connection, err);

        throw err;
    }
}

async function createCollection(
    connection,
    payer,
    metadataV3
) {
    console.log("Creating the collection's mint...");
    const mint = await createMint(
        connection,
        payer,
        payer.publicKey,
        payer.publicKey,
        0
    );
    console.log("Mint address:", mint.toBase58());

    console.log("Creating a token account...");
    const tokenAccount = await createAccount(
        connection,
        payer,
        mint,
        payer.publicKey
    );
    console.log("Token account:", tokenAccount.toBase58());

    console.log("Minting 1 token for the collection...");
    const mintSig = await mintTo(
        connection,
        payer,
        mint,
        tokenAccount,
        payer,
        1,
        [],
        undefined,
        TOKEN_PROGRAM_ID
    );

    const [metadataAccount, _bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata", "utf8"), 
        TOKEN_METADATA_PROGRAM_ID.toBuffer(), 
        mint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Metadata account:", metadataAccount.toBase58());

    const createMetadataIx = createCreateMetadataAccountV3Instruction(
        {
            metadata: metadataAccount,
            mint: mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        },
        {
            createMetadataAccountArgsV3: metadataV3,
        },
    );

    const [masterEditionAccount, _bump2] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata", "utf8"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
            Buffer.from("edition", "utf8"),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Master edition account:", masterEditionAccount.toBase58());

    const createMasterEditionIx = createCreateMasterEditionV3Instruction(
        {
            edition: masterEditionAccount,
            mint: mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
            metadata: metadataAccount,
        },
        {
            createMasterEditionArgs: {
                maxSupply: 0,
            },
        },
    );

    const collectionSizeIX = createSetCollectionSizeInstruction(
        {
            collectionMetadata: metadataAccount,
            collectionAuthority: payer.publicKey,
            collectionMint: mint,
        },
        {
            setCollectionSizeArgs: { size: 50 },
        },
    );

    try {
        const tx = new Transaction()
            .add(createMetadataIx)
            .add(createMasterEditionIx)
            .add(collectionSizeIX);
        tx.feePayer = payer.publicKey;

        const txSignature = await sendAndConfirmTransaction(connection, tx, [payer], {
            commitment: "confirmed",
            skipPreflight: true,
        });

        console.log("\nCollection successfully created!");
        console.log(explorerURL({ txSignature }));
    } catch (err) {
        console.error("\nFailed to create collection:", err);

        await extractSignatureFromFailedTransaction(connection, err);

        throw err;
    }

    return { mint, tokenAccount, metadataAccount, masterEditionAccount };
}

async function mintCompressedNFT(
    connection,
    payer,
    treeAddress,
    collectionMint,
    collectionMetadata,
    collectionMasterEditionAccount,
    compressedNFTMetadata,
    receiverAddress
) {
    const [treeAuthority, _bump] = PublicKey.findProgramAddressSync(
        [treeAddress.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
    );

    const [bubblegumSigner, _bump2] = PublicKey.findProgramAddressSync(
        [Buffer.from("collection_cpi", "utf8")],
        BUBBLEGUM_PROGRAM_ID
    );

    const mintIxs = [];

    const metadataArgs = Object.assign(compressedNFTMetadata, {
        collection: { key: collectionMint, verified: false },
    });

    const computedDataHash = new PublicKey(computeDataHash(metadataArgs)).toBase58();
    const computedCreatorHash = new PublicKey(computeCreatorHash(metadataArgs.creators)).toBase58();
    console.log("computedDataHash:", computedDataHash);
    console.log("computedCreatorHash:", computedCreatorHash);

    const ix = createMintToCollectionV1Instruction(
        {
            treeAuthority,
            leafOwner: receiverAddress || payer.publicKey, //receiverAddress || 
            leafDelegate: payer.publicKey,
            merkleTree: treeAddress,
            payer: payer.publicKey,
            treeDelegate: payer.publicKey,
            collectionAuthority: payer.publicKey,
            collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
            collectionMint: collectionMint,
            collectionMetadata: collectionMetadata,
            editionAccount: collectionMasterEditionAccount,
            bubblegumSigner: bubblegumSigner,
            logWrapper: SPL_NOOP_PROGRAM_ID,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        },
        {
            metadataArgs,
        },
    )

    mintIxs.push(ix);

    try {
        const tx = new Transaction().add(...mintIxs);
        tx.feePayer = payer.publicKey;
        
        const blockhash = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash.blockhash

        // console.log(tx.instructions[0].keys)

        // console.log('payer:',payer)
        const txSignature = await sendAndConfirmTransaction(connection, tx, [payer], {
            commitment: "confirmed",
            skipPreflight: true,
        });

        console.log("\nSuccessfully minted the compressed NFT!");
        console.log(explorerURL({ txSignature }));

        return txSignature;
    } catch (err) {
        console.error("\nFailed to mint compressed NFT:", err);

        await extractSignatureFromFailedTransaction(connection, err);

        throw err;
    }
}

module.exports = {
    createTree,
    createCollection,
    mintCompressedNFT,
};
