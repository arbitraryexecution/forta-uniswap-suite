const { ethers } = require("forta-agent");

const contractAddresses = require("../contract-addresses.json");

function getAbi(abiFile) {
  const { abi } = require(`../abi/${abiFile}`);
  return abi;
}

function getContract(name, provider) {
  const { address, abiFile } = contractAddresses[name];
  const abi = getAbi(abiFile);
  const contract = new ethers.Contract(address, abi, provider);
  return contract;
}

module.exports = {
  getAbi,
  getContract,
};
