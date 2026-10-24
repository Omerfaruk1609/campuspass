import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { ethers } = await network.create();
  const networkInfo = await ethers.provider.getNetwork();
  const signers = await ethers.getSigners();

  if (signers.length === 0) {
    throw new Error(
      "Dağıtım için imzalayıcı cüzdan (signer) bulunamadı. Lütfen MONAD_PRIVATE_KEY yapılandırmasını kontrol edin."
    );
  }

  const deployer = signers[0];
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== CampusPass Dağıtım (Deploy) Başlatılıyor ===");
  console.log(`Chain ID       : ${networkInfo.chainId.toString()}`);
  console.log(`Dağıtıcı Adres : ${deployer.address}`);
  console.log(`MON Bakiyesi   : ${ethers.formatEther(balance)} MON`);

  if (balance === 0n) {
    throw new Error(
      "Yetersiz bakiye (0 MON). İşlem ücretini (gas) karşılamak için cüzdanınızda Testnet MON bulunmalıdır."
    );
  }

  console.log("\nCampusPass akıllı sözleşmesi ağa gönderiliyor...");
  const campusPass = await ethers.deployContract("CampusPass");
  await campusPass.waitForDeployment();

  const contractAddress = await campusPass.getAddress();
  const deployTx = campusPass.deploymentTransaction();
  const txHash = deployTx ? deployTx.hash : null;

  console.log("\n=== Dağıtım Başarıyla Tamamlandı ===");
  console.log(`CampusPass Sözleşme Adresi : ${contractAddress}`);
  if (txHash) {
    console.log(`İşlem Özeti (Tx Hash)      : ${txHash}`);
  }
  if (networkInfo.chainId === 10143n) {
    console.log(`Monad Explorer             : https://testnet.monadexplorer.com/address/${contractAddress}`);
  }

  // Frontend ve proje kayıtları için dağıtım bilgilerini kaydet
  const deploymentData = {
    contractName: "CampusPass",
    address: contractAddress,
    deployer: deployer.address,
    chainId: Number(networkInfo.chainId),
    transactionHash: txHash,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.resolve(__dirname, "../src/data/deployment.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(deploymentData, null, 2) + "\n", "utf8");
  console.log(`Dağıtım bilgileri kaydedildi: src/data/deployment.json`);
}

main().catch((error) => {
  console.error("\n[HATA] Dağıtım başarısız oldu:", error.message || error);
  process.exitCode = 1;
});
