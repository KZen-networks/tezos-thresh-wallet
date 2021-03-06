# Tezos Threshold Wallet

![npm](https://badge.fury.io/js/%40kzen-networks%2Ftezos-thresh-wallet.svg)

Tezos wallet and JS SDK powered by two-party EdDSA (Ed25519).

## Installation
1. If on Linux, install needed packages:
```sh
$ sudo apt-get update
$ sudo apt-get install libgmp3-dev pkg-config libssl-dev clang libclang-dev
```
2. Install [Node.js](https://nodejs.org/en/download/)<br>
(tested on Node 10)
3. Install [nightly Rust](https://github.com/rust-lang/rustup.rs#installation)<br>
(tested on rustc 1.38.0-nightly (0b680cfce 2019-07-09))
4. Install the package:
```sh
$ npm install @kzen-networks/tezos-thresh-wallet
```

## Usage
Server (acts as the co-signer in the two-party signing protocol):
```js
import { Ed25519Party1 } from '@kzen-networks/tezos-thresh-wallet';

new Ed25519Party1().launchServer();
```
Client:
```js
import TezClient, { Ed25519Party2, Ed25519Party2Share } from '@kzen-networks/tezos-thresh-wallet';
const client = new TezClient('http://127.0.0.1:8732');

const P1_SERVER_ENDPOINT = 'http://localhost:8000';
const party2 = new Ed25519Party2(P1_SERVER_ENDPOINT);

(async () => {
  await client.importEd25519Party2(party2);  // activates two-party key generation protocol
  const address = client.party2.publicKeyHash();
  console.log(address);
  // tz1csGALMvB6sh3KJyHAMYVYVMUaucBgBDw7

  /* Now you should deposit XTZ into this address */

  console.log(await client.getBalance(address));  // in mutez (1 XTZ = 1,000,000 mutez)
  // 982974

  const { hash } = await client.transfer({
    source: address,
    to: 'tz1YaqLFe8nywjCiAF1vK1U1yns69nPQoyg1',
    amount: 10000
  });
  console.log(hash);
  // ooebvSGroFp7bma7Gicx5s2GeDT2j69m5r8z2nUMMzogYASCBzX

})();
```

## Demo
You can also use a demo using the command line.<br>
Server:
```sh
$ demo/server
```
Client:
```sh
$ demo/client --help
Usage: client [options] [command]

Options:
  -h, --help                           output usage information

Commands:
  generate-address|a                   Generate a new Tezos address
  balance|b <address>                  Get the balance of a Tezos address
  transfer|t <from> <to> <xtz_amount>  Transfer XTZ
  delegate|d <from> <to>               Delegate account funds to a given delegator for staking
```

|![Transfer demo](https://raw.githubusercontent.com/KZen-networks/tezos-thresh-wallet/master/demo/tezos-tss-demo.gif "Tezos Threshold Wallet Demo")|
|:--:|

## Development
```sh
$ git clone https://github.com/KZen-networks/tezos-thresh-wallet
$ cd tezos-thresh-wallet
$ npm install
$ npm run build
```
Built files will be located in the `dist` folder.

## License
MIT

## Credits
This work is a fork extending the work of Andrew Kishino's [Sotez](https://github.com/AndrewKishino/sotez).
