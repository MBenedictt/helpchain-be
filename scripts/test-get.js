const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    const factoryAddress = "0xB496dcF7c5E310fb113ee7F11D5bc34E69d0dF0A"; // your deployed factory

    const factory = await hre.ethers.getContractAt(
        "CrowdfundingFactory", // must match contract name in artifacts
        factoryAddress
    );

    // READ all campaigns
    const campaigns = await factory.getAllCampaigns();
    console.log("All campaigns:", campaigns);

    // READ campaigns by user
    const userCampaigns = await factory.getUserCampaigns(deployer.address);
    console.log("User campaigns:", userCampaigns);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});