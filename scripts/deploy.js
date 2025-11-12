const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
    const Factory = await hre.ethers.getContractFactory("CrowdfundingFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const contractAddress = await factory.getAddress();
    console.log("CrowdfundingFactory deployed at:", contractAddress);

    // Save address and ABI for frontend
    const contractsDir = path.join(__dirname, "..", "frontend-artifacts");
    if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir);
    }

    fs.writeFileSync(
        path.join(contractsDir, "CrowdfundingFactory-address.json"),
        JSON.stringify({ address: contractAddress }, null, 2)
    );

    const artifact = await hre.artifacts.readArtifact("CrowdfundingFactory");
    fs.writeFileSync(
        path.join(contractsDir, "CrowdfundingFactory.json"),
        JSON.stringify(artifact, null, 2)
    );
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});