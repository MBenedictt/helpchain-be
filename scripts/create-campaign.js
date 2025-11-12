const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    const factoryAddress = "0x6A30cEbB2e60314E6eD5Cb0e3B022681D14469E3"; // Replace this with your deployed factory address
    const factory = await hre.ethers.getContractAt("CrowdfundingFactory", factoryAddress);

    const tx = await factory.createCampaign(
        "Save The Turtles",
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        "2000",
        30 // duration in days
    );

    await tx.wait();
    console.log("Campaign created!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});