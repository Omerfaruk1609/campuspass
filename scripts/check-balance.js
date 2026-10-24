import { network } from "hardhat";

async function main() {
  const { ethers } = await network.create();
  const networkInfo = await ethers.provider.getNetwork();
  const signers = await ethers.getSigners();

  if (signers.length === 0) {
    throw new Error(
      "Hiçbir cüzdan hesabı bulunamadı. Lütfen MONAD_PRIVATE_KEY anahtarını Hardhat Keystore ile tanımlayın."
    );
  }

  const deployer = signers[0];
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== Monad Testnet Bağlantı ve Bakiye Kontrolü ===");
  console.log(`Ağ Chain ID    : ${networkInfo.chainId.toString()}`);
  console.log(`Dağıtıcı Adres : ${deployer.address}`);
  console.log(`MON Bakiyesi   : ${ethers.formatEther(balance)} MON`);

  if (balance === 0n) {
    console.warn(
      "\n[UYARI] Cüzdan bakiyesi 0 MON! Dağıtım yapmadan önce test cüzdanınıza Monad Testnet MON yüklemelisiniz."
    );
    process.exitCode = 1;
  } else {
    console.log("\n[BAŞARILI] Bakiye doğrulandı. Dağıtım (deploy) işlemine geçebilirsiniz.");
  }
}

main().catch((error) => {
  console.error("Bakiye kontrolü sırasında hata oluştu:", error.message || error);
  process.exitCode = 1;
});
