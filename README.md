# Compressed NFT
## About Compressed NFT
_"Instead of storing an NFT's metadata in a typical Solana account, compressed NFTs store the metadata within the ledger. "_  [(solana)](https://docs.solana.com/developing/guides/compressed-nfts#intro-to-compressed-nfts)

壓縮NFT顧名思義，對NFT進行狀態壓縮([state compression & merkle tree](https://docs.solana.com/learn/state-compression))，將NFT的Metadata儲存進merkle tree並保留hash資料以確保資料安全，這種做法使上鏈的儲存成本大幅度下降。

## Merkle trees and concurrent merkle trees
[solana documect](https://docs.solana.com/learn/state-compression#merkle-trees-and-concurrent-merkle-trees)

_"A merkle tree, sometimes called a "hash tree", is a hash based binary tree structure where each leaf node is represented as a cryptographic hash of its inner data. And every node that is not a leaf, called a branch, is represented as a hash of its child leaf hashes."_

_"Each branch is then also hashed together, climbing the tree, until eventually only a single hash remains. This final hash, called the root hash or "root", can then be used in combination with a "proof path" to verify any piece of data stored within a leaf node."_

Merkle tree基於二元樹結構，以雜湊加密的形式儲存資料，每個資料儲存節點稱為leaf，其餘稱為branch(proof)，並一層一層合併雜湊直到剩最後一個值，即為root hash。驗證方式將由取得leaf & proof來計算root hash值是否正確。

_"A Concurrent merkle tree stores a secure changelog of the most recent changes."_

Concurrent merkle tree與Merkle tree的區別在於增加了**"changelog buffer"**，他儲存足夠的資料，能使程式運行得更快。

設定Concurrent merkle tree有以下三種參數:
1. max depth
2. max buffer size
3. canopy depth

前面提到的changelog buffer就是用`MaxBufferSize`來決定，`MaxDepth`的概念是總共的NFT數量(the maximum number of hops to get from any data leaf to the root of the tree)，因為他是二元樹架構，所以它的計算方式是`2^<MaxDepth>`

⚠️⚠️**Warning: The higher the max depth, the higher the cost**

`canopyDepth`用來確定有哪些proof資料要儲存在鏈上。
_"For example, a tree with a max depth of 14 would require 14 total proof nodes. With a canopy of 10, only 4 proof nodes are required to be submitted per update transaction."_

⚠️⚠️**Warning: The larger the canopy depth value, the higher the cost**

## About Metadata
[solana document](https://docs.solana.com/developing/guides/compressed-nfts#reading-compressed-nfts-metadata)

_Within the Read API, digital assets (i.e. NFTs) are indexed by their id. This asset id value differs slightly between traditional NFTs and compressed NFTs:_

* _for traditional/uncompressed NFTs: this is the token's address for the actual Account on-chain that stores the metadata for the asset._
* _for compressed NFTs: this is the id of the compressed NFT within the tree and is NOT an actual on-chain Account address. While a compressed NFT's assetId resembles a traditional Solana Account address, it is not._

asset:![螢幕擷取畫面_2023-09-24_212841](/uploads/a99e0e9071c167b0133d7e43b2eab2c1/螢幕擷取畫面_2023-09-24_212841.png)

asset proof![螢幕擷取畫面_2023-09-24_222651](/uploads/d5b49d3265d6ef3ef35358ebee764d35/螢幕擷取畫面_2023-09-24_222651.png)

## Get Started: Setup
Before we start creating our compressed NFT collection, we need to install a few packages:
```
$ npm i @solana/web3.js @solana/spl-token @solana/spl-account-compression
```
```
$ npm i @metaplex-foundation/mpl-bubblegum @metaplex-foundation/mpl-token-metadata
```
```
$ npm i dotenv
```

⚠️**Warning:**

Currently, the suite versions are being updated consecutively. If you install the latest version directly, you might encounter missing functions. It is advisable to opt for the following versions:
- "@metaplex-foundation/mpl-bubblegum": "^0.7.0",
- "@metaplex-foundation/mpl-token-metadata": "^2.12.0",
- "@solana/spl-account-compression": "^0.1.10",
- "@solana/spl-token": "^0.3.8",
- "@solana/web3.js": "^1.78.5",
- "dotenv": "^16.3.1"

## Part 1: How to create and mint a compressed NFT
There are 3 main steps to proceed:
1. create collection(or use an existing one)
2. create merkle tree
3. mint compressed NFTs into your tree (to any owner's address you want)

### Create NFT Collection
There're 2 methods to create NFT collection, **Metpalex NFT Client** & **Create Instruction**. If you want to use `NFTclient`, remember to install the required packages and declare variables. The currently installed packages include only those necessary for the `creatInstruction` method.

#### Method 1: NFTclient
<details><summary>code</summary>

``` javascript
async function createCollectionNft() {
  const { nft: collectionNft } = await metaplex.nfts().create({
    name: "Super Sweet NFT Collection",
    symbol: "SSNC",
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
    isMutable: false,
    collectionDetails: null,
    updateAuthority: payer,
  });

  console.log(`✅ - Minted Collection NFT: ${collectionNft.address.toString()}`);
  console.log(`     https://explorer.solana.com/address/${collectionNft.address.toString()}?cluster=devnet`);
  // console.log(collectionNft)

  return [collectionNft.address, collectionNft.token.address, collectionNft.metadataAddress, collectionNft.edition.address]
}
```

</details>

#### Method 2: createInstruction
<details><summary>code</summary>

`index.js`:
``` javascript
async function createCollectionNFT() {
    // Define the metadata to be used for creating the NFT collection
    const collectionMetadataV3 = {
        data: {
            name: "Super Sweet NFT Collection",
            symbol: "SSNC",
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
```

`compression.js`:
``` javascript
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
```

</details>

### Create Merkle Tree
There are still two approaches available: the `Bubblegum SDK Client` and the `Bubblegum SDK Create Instruction`.

Please take note of a particular detail here: the latest version of Bubblegum SDK (1.0.1) does not include 'create instruction' functions. Therefore, if you intend to utilize these functions, you will need to use an older version (0.7.0). 

Additionally, when using the client, `umi` is required, which results in the need to employ the `@coral-xyz/anchor` package for wallet connectivity. This may potentially conflict with the wallet method used by the NFTclient. And also, if you're only creating and minting, it's okay to use the `Connection()` function from `@solana/web3.js`. However, if you plan to transfer, you'll need to use the `WrapperConnection()` that we'll create later. This way, you'll be able to read the metadata in the tree.

#### Method 1: Bubblegum Client(Unresolved Issue)
<details><summary>code</summary>

``` javascript
async function createCnftTree() {
  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
  })
  console.log('builder:', builder.items)

  // const result = await builder.sendAndConfirm(umi);
  // console.log('result:', result)
}
```

</details>

#### Method 2: Bubblegum SDK createInstruction
<details><summary>code</summary>

`index.js`:
``` javascript
async function createMerkleTree() {
    const maxDepthSizePair = {
        maxDepth: 14, // max=16,384 nodes
        maxBufferSize: 64,
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
```

`compression.js`:
``` javascript
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

        const txSignature = await sendAndConfirmTransaction(
            connection,
            tx,
            [treeKeypair, payer],
            {
                commitment: "confirmed",
                skipPreflight: true,
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
```

</details>

### Create mint
There're still other ways to do this, but I only try this method here.

#### Method 1: Create Instruction
<details><summary>code</summary>

`index.js`:
``` javascript
async function mintSingleCNFT(treeKeypair, collection, collectionMetadataV3) {
    const compressedNFTMetadata = {
        name: "NFT Name",
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
```

`compression.js`:
``` javascript
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
```

</details>


## Part 2: How to transfer a compressed NFT
1. get the NFT's "asset" data (from the indexer)
2. get the NFT's proof (from the indexer)
3. get the Merkle tree account (directly from the Solana blockchain)
4. prepare the asset proof
5. build and send the transfer instruction

### ReadApi (`WrapperConnection()`)
- Wrapper class to add additional methods on top the standard Connection from `@solana/web3.js`
- Specifically, adding the RPC methods used by the Digital Asset Standards (DAS) ReadApi 
- For state compression and compressed NFTs

<details><summary>code</summary>

``` javascript
class WrapperConnection extends Connection {
  constructor(endpoint, commitmentOrConfig) {
    super(endpoint, commitmentOrConfig);
  }

  async callReadApi(jsonRpcParams) {
    const response = await fetch(this.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: jsonRpcParams.method,
        id: jsonRpcParams.id ?? "rpd-op-123",
        params: jsonRpcParams.params,
      }),
    });

    return await response.json();
  }

  async getAsset(assetId) {
    const { result: asset } = await this.callReadApi({
      method: "getAsset",
      params: {
        id: assetId.toBase58(),
      },
    });

    if (!asset) throw new ReadApiError("No asset returned");

    return asset;
  }

  async getAssetProof(assetId) {
    const { result: proof } = await this.callReadApi({
      method: "getAssetProof",
      params: {
        id: assetId.toBase58(),
      },
    });

    if (!proof) throw new ReadApiError("No asset proof returned");

    return proof;
  }

  async getAssetsByGroup({
    groupKey,
    groupValue,
    page,
    limit,
    sortBy,
    before,
    after,
  }) {
    if (typeof page == "number" && (before || after))
      throw new ReadApiError("Pagination Error. Only one pagination parameter supported per query.");

    const { result } = await this.callReadApi({
      method: "getAssetsByGroup",
      params: {
        groupKey,
        groupValue,
        after: after ?? null,
        before: before ?? null,
        limit: limit ?? null,
        page: page ?? 1,
        sortBy: sortBy ?? null,
      },
    });

    if (!result) throw new ReadApiError("No results returned");

    return result;
  }

  async getAssetsByOwner({
    ownerAddress,
    page,
    limit,
    sortBy,
    before,
    after,
  }) {
    if (typeof page == "number" && (before || after))
      throw new ReadApiError("Pagination Error. Only one pagination parameter supported per query.");

    const { result } = await this.callReadApi({
      method: "getAssetsByOwner",
      params: {
        ownerAddress,
        after: after ?? null,
        before: before ?? null,
        limit: limit ?? null,
        page: page ?? 1,
        sortBy: sortBy ?? null,
      },
    });

    if (!result) throw new ReadApiError("No results returned");

    return result;
  }
}
```
</details>


### Get `asset` data and `asset proof`
About `asset` data and `asset proof` have been mentioned above👆

#### Get asset data
<details><summary>code</summary>

``` javascript
async function getTheAsset(assetId) {
  printConsoleSeparator("Get the asset details from the RPC");

  const asset = await connection.getAsset(assetId);

  console.log(asset);

  console.log("Is this a compressed NFT?", asset.compression.compressed);
  console.log("Current owner:", asset.ownership.owner);
  console.log("Current delegate:", asset.ownership.delegate);

  // ensure the current asset is actually a compressed NFT
  if (!asset.compression.compressed)
    return console.error(`The asset ${asset.id} is NOT a compressed NFT!`);

  return asset
}
```

</details>

#### Get asset proof
<details><summary>code</summary>

``` javascript
async function getTheAssetProof(assetId) {
  printConsoleSeparator("Get the asset proof from the RPC");

  const assetProof = await connection.getAssetProof(assetId);

  console.log(assetProof);

  return assetProof
}
```

</details>

### Get Merkle tree and verify proof
#### Get Merkle tree
<details><summary>code</summary>

``` javascript
async function getTreeAccount(asset) {
  // parse the tree's address from the `asset`
  const treeAddress = new PublicKey(asset.compression.tree);
  console.log("Tree address:", treeAddress.toBase58());

  // get the tree's account info from the cluster
  const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, treeAddress);

  return [treeAddress, treeAccount]
}
```

</details>

#### Verify proof
<details><summary>code</summary>

``` javascript
async function verifyTree(asset, assetProof, treeAccount) {
  printConsoleSeparator("Validate the RPC provided asset proof on the client side:");

  const merkleTreeProof = {
    leafIndex: asset.compression.leaf_id,
    leaf: new PublicKey(assetProof.leaf).toBuffer(),
    root: new PublicKey(assetProof.root).toBuffer(),
    proof: assetProof.proof.map(node => new PublicKey(node).toBuffer())
  };

  const currentRoot = treeAccount.getCurrentRoot();
  const rpcRoot = new PublicKey(assetProof.root).toBuffer();

  console.log(
    "Is RPC provided proof/root valid:",
    MerkleTree.verify(rpcRoot, merkleTreeProof, false),
  );

  console.log(
    "Does the current on-chain root match RPC provided root:",
    new PublicKey(currentRoot).toBase58() === new PublicKey(rpcRoot).toBase58(),
  );
}
```

</details>

### Transfer
<details><summary>code</summary>

``` javascript
async function transferNFT(payer, testWallet, assetId, asset, assetProof, treeAddress, treeAccount) {
  // set the new owner of the compressed NFT
  const newLeafOwner = testWallet.publicKey;

  // set the current leafOwner (aka the current owner of the NFT)
  const leafOwner = new PublicKey(asset.ownership.owner);

  // set the current leafDelegate
  const leafDelegate = !!asset.ownership.delegate
    ? new PublicKey(asset.ownership.delegate)
    : leafOwner;

  /**
   * NOTE: When there is NOT a current `leafDelegate`,
   * the current leafOwner` address should be used
   */

  const treeAuthority = treeAccount.getAuthority();
  const canopyDepth = treeAccount.getCanopyDepth();

  // parse the list of proof addresses into a valid AccountMeta[]
  const proofPath = assetProof.proof
    .map(node => ({
      pubkey: new PublicKey(node),
      isSigner: false,
      isWritable: false
    }))
    .slice(0, assetProof.proof.length - (canopyDepth ? canopyDepth : 0));

  // create the NFT transfer instruction (via the Bubblegum package)
  const transferIx = createTransferInstruction(
    {
      merkleTree: treeAddress,
      treeAuthority,
      leafOwner,
      leafDelegate,
      newLeafOwner,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      anchorRemainingAccounts: proofPath
    },
    {
      root: [...new PublicKey(assetProof.root.trim()).toBytes()],
      dataHash: [...new PublicKey(asset.compression.data_hash.trim()).toBytes()],
      creatorHash: [...new PublicKey(asset.compression.creator_hash.trim()).toBytes()],
      nonce: asset.compression.leaf_id,
      index: asset.compression.leaf_id
    },
    BUBBLEGUM_PROGRAM_ID
  );

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  printConsoleSeparator("Sending the transfer transaction...");

  try {
    // create and send the transaction to transfer ownership of the NFT
    const tx = new Transaction().add(transferIx);
    tx.feePayer = payer.publicKey;
    // console.log('tx:', tx)

    // send the transaction
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      // ensuring the feePayer signs the transaction
      [payer],
      {
        commitment: "confirmed",
        skipPreflight: true
      }
    );

    console.log("\nTransfer successful!\n", explorerURL({ txSignature }));

    /**
     * Re-fetch the asset from the RPC to see the new ownership
     */
    const newAsset = await connection.getAsset(assetId);

    printConsoleSeparator();

    /**
     * NOTE: Since part of the asset's data changed (i.e. the owner),
     * the proof will have also changed
     */
    // const newAssetProof = await connection.getAssetProof(assetId);
    // console.log(newAssetProof);

    // display the new and old ownership values
    console.log("   Old owner:", asset.ownership.owner);
    console.log("   Old delegate:", asset.ownership.delegate);
    console.log("   New owner:", newAsset.ownership.owner);
    console.log("   New delegate:", newAsset.ownership.delegate);

    // the end :)
  } catch (err) {
    console.error("\nFailed to create transfer nft:", err);

    console.log("\n=======================");
    console.log("  Transfer failed!");
    console.log("=======================");

    // log a block explorer link for the failed transaction
    await extractSignatureFromFailedTransaction(connection, err);

    throw err;
  }
}
```

</details>
