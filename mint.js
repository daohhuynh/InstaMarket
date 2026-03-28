const { Connection, Keypair } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const os = require('os');

async function main() {
    // 1. Catch the CLI argument (e.g., node mint.js 500000)
    const amountArg = process.argv[2];
    if (!amountArg || isNaN(amountArg)) {
        console.error("❌ Error: You must specify an amount to mint.");
        console.log("👉 Usage: node mint.js <amount>");
        process.exit(1);
    }
    const mintAmount = parseInt(amountArg, 10);

    const connection = new Connection('http://localhost:8899', 'confirmed');
    const keyData = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/solana/id.json`));
    const wallet = Keypair.fromSecretKey(new Uint8Array(keyData));

    console.log(`Spinning up Mock USDC and minting ${mintAmount.toLocaleString()} tokens...`);
    
    const mint = await createMint(connection, wallet, wallet.publicKey, null, 6);
    console.log(`\n✅ MOCK USDC TOKEN ADDRESS: ${mint.toBase58()}`);

    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, wallet.publicKey);
    
    // 2. Multiply your dynamic amount by the 6 decimal places (1,000,000)
    await mintTo(connection, wallet, mint, tokenAccount.address, wallet, mintAmount * 1_000_000);
    
    console.log(`✅ Successfully injected ${mintAmount.toLocaleString()} Mock USDC into your wallet.`);
}

main().catch(err => console.error(err));
