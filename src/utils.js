const ethers = require('ethers');

const contractAddresses = require('../contract-addresses.json');

// helper function for loading a contract abi
function getAbi(abiName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiName}.json`);
  return abi;
}

function getAbiFromInterface(interfaceName) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/interfaces/${interfaceName}.json`);
  return abi;
}

// helper function for creating an ethers.js Provider
function getProvider(jsonRpcUrl) {
  const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
  return provider;
}

// helper function for creating an ethers.js Interface object
function getInterface(name) {
  const { abiName } = contractAddresses[name];
  const { abi } = getAbi(abiName);
  const iface = new ethers.utils.Interface(abi);
  return iface;
}

// helper function for creating an ethers.js Contract object
function getContract(name, provider) {
  const { address, abiName } = contractAddresses[name];
  const abi = getAbi(abiName);
  const contract = new ethers.Contract(address, abi, provider);
  return contract;
}

module.exports = {
  getAbi,
  getProvider,
  getInterface,
  getContract,
  getAbiFromInterface,
};
