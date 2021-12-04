const ethers = require('ethers');

const contractAddresses = require('../contract-addresses.json');

// helper function for loading a contract abi
function getAbi(abiFile) {
  // eslint-disable-next-line global-require,import/no-dynamic-require
  const { abi } = require(`../abi/${abiFile}`);
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
  const { abiFile } = contractAddresses[name];
  const { abi } = getAbi(abiFile);
  const iface = new ethers.utils.Interface(abi);
  return iface;
}

// helper function for creating an ethers.js Contract object
function getContract(name, provider) {
  const { address, abiFile } = contractAddresses[name];
  const abi = getAbi(abiFile);
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
