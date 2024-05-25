import Web3 from "web3";

let minABI = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function"
  },
  // decimals
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function"
  }
];

const addr = "0xxxx";

const contractSeedTree = "0xxxx";

export default function IndexPage() {
  const web3 = new Web3(
    new Web3.providers.HttpProvider("https://bsc-dataseed.binance.org/")
    //Web3.givenProvider
  );

  const click = async () => {
    console.log("teste");
    var filter = { from: addr };
    //web3.eth.getBalance(addr).then(console.log);
    let contract = new web3.eth.Contract(minABI, contractSeedTree);
    //var balance1 = contract.balanceOf(addr).toNumber();
    var pastTransferEvents = contract.getPastEvents("allEvents", filter, {
      fromBlock: 0
    });
  };
  return (
    <div>
      Address: {addr}
      <br />
      <button onClick={click}>List</button>
      <br />
      {web3 ? "loading" : web3.eth.getBalance(addr).then(console.log)}
    </div>
  );
}
